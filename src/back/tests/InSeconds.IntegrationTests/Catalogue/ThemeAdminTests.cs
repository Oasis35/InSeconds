using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>La liste des thèmes de l'admin : ajout, renommage, suppression d'un thème que plus aucun morceau n'a, association à un morceau (#536).</summary>
public class ThemeAdminTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Themes = "/api/admin/catalogue/themes";

    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
        await _app.Api.ExecuteAsync("""
            INSERT INTO catalogue.tracks (id, deezer_track_id, artist, title, preview_status, created_at) VALUES
              (1, 1001, 'A', 'T1', 1, now()), (2, 1002, 'A', 'T2', 1, now())
            """);
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<ThemeItem> AddAsync(string name)
    {
        var response = await _app.Admin().PostAsJsonAsync(Themes, new ThemeName(name), Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<ThemeItem>(Ct))!;
    }

    private async Task<string?> CodeOfAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct))!.Extensions["code"]?.ToString();

    [Fact]
    public async Task Ajouter_LeMetDansLaListe_NomNettoye_ParOrdreAlphabetique()
    {
        await AddAsync("  Films ");
        await AddAsync("Années 80");

        var list = await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct);

        Assert.Equal(["Années 80", "Films"], list!.Select(t => t.Name));
        Assert.All(list!, t => Assert.Equal(0, t.TrackCount));
    }

    [Fact]
    public async Task Ajouter_UnNomDejaPris_CasseIgnoree_409()
    {
        await AddAsync("Films");

        var response = await _app.Admin().PostAsJsonAsync(Themes, new ThemeName("films"), Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("catalogue.theme_name_taken", await CodeOfAsync(response));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Ajouter_UnNomVide_400(string name) =>
        Assert.Equal(HttpStatusCode.BadRequest, (await _app.Admin().PostAsJsonAsync(Themes, new ThemeName(name), Ct)).StatusCode);

    [Fact]
    public async Task Renommer_ChangeLeNom_MaisPasEnPrendreUnAutre()
    {
        var films = await AddAsync("Films");
        await AddAsync("Rap");

        var renamed = await _app.Admin().PatchAsJsonAsync($"{Themes}/{films.Id}", new ThemeName("Cinéma"), Ct);
        var clash = await _app.Admin().PatchAsJsonAsync($"{Themes}/{films.Id}", new ThemeName("rap"), Ct);

        Assert.Equal("Cinéma", (await renamed.Content.ReadFromJsonAsync<ThemeItem>(Ct))!.Name);
        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _app.Admin().PatchAsJsonAsync($"{Themes}/9999", new ThemeName("X"), Ct)).StatusCode);
    }

    [Fact]
    public async Task Associer_UnThemeDeLaListe_LeFaitCompter_EtLeRetirer_LeLibere()
    {
        var films = await AddAsync("Films");

        var set = await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/1/themes", new SetTrackThemes([films.Id]), Ct);

        Assert.Equal(HttpStatusCode.NoContent, set.StatusCode);
        Assert.Equal(1, (await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct))!.Single().TrackCount);
        var pool = await _app.Admin().GetFromJsonAsync<IReadOnlyList<TrackListItem>>("/api/admin/catalogue/tracks", Ct);
        Assert.Equal([films.Id], pool!.Single(t => t.Id == 1).ThemeIds);
        Assert.Empty(pool!.Single(t => t.Id == 2).ThemeIds!);

        Assert.Equal(HttpStatusCode.NoContent, (await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/1/themes", new SetTrackThemes([]), Ct)).StatusCode);
        Assert.Equal(0, (await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct))!.Single().TrackCount);
    }

    [Fact]
    public async Task Associer_PlusieursThemes_RemplaceCeuxD_Avant()
    {
        var films = await AddAsync("Films");
        var rap = await AddAsync("Rap");
        var eighties = await AddAsync("Années 80");

        await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/1/themes", new SetTrackThemes([films.Id, rap.Id, films.Id]), Ct);
        await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/1/themes", new SetTrackThemes([rap.Id, eighties.Id]), Ct);

        var pool = await _app.Admin().GetFromJsonAsync<IReadOnlyList<TrackListItem>>("/api/admin/catalogue/tracks", Ct);
        Assert.Equal(new[] { rap.Id, eighties.Id }.Order(), pool!.Single(t => t.Id == 1).ThemeIds!.Order());
        var counts = (await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct))!.ToDictionary(t => t.Name, t => t.TrackCount);
        Assert.Equal((0, 1, 1), (counts["Films"], counts["Rap"], counts["Années 80"]));
    }

    [Fact]
    public async Task Associer_UnThemeInconnuOuUnMorceauInconnu_404_JamaisDeSaisieLibre()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/1/themes", new SetTrackThemes([9999]), Ct)).StatusCode);
        var films = await AddAsync("Films");
        Assert.Equal(HttpStatusCode.NotFound, (await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/999/themes", new SetTrackThemes([films.Id]), Ct)).StatusCode);
    }

    [Fact]
    public async Task Icone_SeDonneSeLitEtSeRetire()
    {
        var films = await AddAsync("Films");
        Assert.Null(films.Icon);

        var set = await _app.Admin().PutAsJsonAsync($"{Themes}/{films.Id}/icon", new ThemeIcon(" clapperboard "), Ct);
        var listed = (await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct))!.Single();
        var cleared = await _app.Admin().PutAsJsonAsync($"{Themes}/{films.Id}/icon", new ThemeIcon(null), Ct);
        var listedAgain = (await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct))!.Single();

        Assert.Equal(HttpStatusCode.NoContent, set.StatusCode);
        Assert.Equal("clapperboard", listed.Icon);
        Assert.Equal(HttpStatusCode.NoContent, cleared.StatusCode);
        Assert.Null(listedAgain.Icon);
    }

    [Theory]
    [InlineData("Clapperboard")]
    [InlineData("clap board")]
    [InlineData("-film")]
    [InlineData("film--roll")]
    [InlineData("<svg>")]
    public async Task Icone_UnNomInvalide_400(string icon)
    {
        var films = await AddAsync("Films");

        var response = await _app.Admin().PutAsJsonAsync($"{Themes}/{films.Id}/icon", new ThemeIcon(icon), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null((await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct))!.Single().Icon);
    }

    [Fact]
    public async Task Icone_UnThemeInconnu_404()
    {
        var response = await _app.Admin().PutAsJsonAsync($"{Themes}/999/icon", new ThemeIcon("film"), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("catalogue.theme_not_found", await CodeOfAsync(response));
    }

    [Fact]
    public async Task Supprimer_SeulementSiAucunMorceauNeL_A()
    {
        var films = await AddAsync("Films");
        await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/1/themes", new SetTrackThemes([films.Id]), Ct);

        var refused = await _app.Admin().DeleteAsync($"{Themes}/{films.Id}", Ct);
        await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/1/themes", new SetTrackThemes([]), Ct);
        var deleted = await _app.Admin().DeleteAsync($"{Themes}/{films.Id}", Ct);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("catalogue.theme_in_use", await CodeOfAsync(refused));
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Empty((await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct))!);
        Assert.Equal(HttpStatusCode.NotFound, (await _app.Admin().DeleteAsync($"{Themes}/{films.Id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task AjouterEnLot_AjouteSansRetirer_IgnoreLesDejaLaEtLesMorceauxInconnus()
    {
        var films = await AddAsync("Films");
        var rap = await AddAsync("Rap");
        await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/1/themes", new SetTrackThemes([rap.Id]), Ct);

        var response = await _app.Admin().PostAsJsonAsync(
            $"{Themes}/assignments",
            new AssignTracksToThemes([new ThemeAssignment(films.Id, [1, 2, 2, 999]), new ThemeAssignment(rap.Id, [1, 2])]),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(3, (await response.Content.ReadFromJsonAsync<AssignTracksToThemesResult>(Ct))!.Added);
        var pool = await _app.Admin().GetFromJsonAsync<IReadOnlyList<TrackListItem>>("/api/admin/catalogue/tracks", Ct);
        Assert.Equal(new[] { films.Id, rap.Id }.Order(), pool!.Single(t => t.Id == 1).ThemeIds!.Order());
        Assert.Equal(new[] { films.Id, rap.Id }.Order(), pool!.Single(t => t.Id == 2).ThemeIds!.Order());

        var again = await _app.Admin().PostAsJsonAsync($"{Themes}/assignments", new AssignTracksToThemes([new ThemeAssignment(films.Id, [1, 2])]), Ct);
        Assert.Equal(0, (await again.Content.ReadFromJsonAsync<AssignTracksToThemesResult>(Ct))!.Added);
    }

    [Fact]
    public async Task AjouterEnLot_UnThemeInconnu_404_EtRienNEstEcrit()
    {
        var films = await AddAsync("Films");

        var response = await _app.Admin().PostAsJsonAsync(
            $"{Themes}/assignments", new AssignTracksToThemes([new ThemeAssignment(films.Id, [1]), new ThemeAssignment(9999, [2])]), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("catalogue.theme_not_found", await CodeOfAsync(response));
        Assert.Equal(0, (await _app.Admin().GetFromJsonAsync<IReadOnlyList<ThemeItem>>(Themes, Ct))!.Single().TrackCount);
    }

    [Fact]
    public async Task AjouterEnLot_UneDemandeVideOuSansMorceau_400()
    {
        var films = await AddAsync("Films");

        Assert.Equal(HttpStatusCode.BadRequest, (await _app.Admin().PostAsJsonAsync($"{Themes}/assignments", new AssignTracksToThemes([]), Ct)).StatusCode);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await _app.Admin().PostAsJsonAsync($"{Themes}/assignments", new AssignTracksToThemes([new ThemeAssignment(films.Id, [])]), Ct)).StatusCode);
    }
}
