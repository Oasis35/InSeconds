using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Runs.Application;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Les manches à thème (#536) : à la création de la playlist, la 3e manche (jamais la 1re) tire ses 5 morceaux dans un thème de la liste de l'admin,
/// figé avec la playlist et visible sur son lien et dans l'état de la partie.
/// </summary>
public class RunThemeApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _game = null!;
    private RunGamer _gamer = null!;

    /// <summary>
    /// 60 morceaux : le thème « Années 80 » (id 1) est associé aux morceaux 21 à 30 (dont un aussi « Films », id 2), « Jazz » (id 3) à un seul : trop peu
    /// pour une manche (5 plus 2 de réserve).
    /// </summary>
    public async ValueTask InitializeAsync()
    {
        _game = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 60);
        await _game.Api.ExecuteAsync("INSERT INTO catalogue.themes (id, name, created_at) VALUES (1, 'Années 80', now()), (2, 'Films', now()), (3, 'Jazz', now())");
        await _game.Api.ExecuteAsync("INSERT INTO catalogue.track_themes (track_id, theme_id) SELECT id, 1 FROM catalogue.tracks WHERE id BETWEEN 21 AND 30");
        await _game.Api.ExecuteAsync("INSERT INTO catalogue.track_themes (track_id, theme_id) VALUES (21, 2), (22, 3)");
        _gamer = await _game.NewInvitedAsync("Alice");
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task LaTroisiemeManche_TireSesCinqMorceauxDansLeTheme()
    {
        var play = await _gamer.LaunchAsync();

        var themed = await _game.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{play.Session.ChallengeCode}' AND t.round = 3 AND EXISTS (SELECT 1 FROM catalogue.track_themes x WHERE x.track_id = t.track_id AND x.theme_id = 1)");
        Assert.Equal(5, themed);
    }

    [Fact]
    public async Task LeThemeSeVoitSurLeLienEtDansLEtatDeLaPartie_LaPremiereMancheNEnAJamais()
    {
        var play = await _gamer.LaunchAsync();

        var link = await _gamer.Client.GetFromJsonAsync<RunChallengeResponse>($"/api/runs/challenges/{play.Session.ChallengeCode}", Ct);
        var theme = Assert.Single(link!.Themes!);
        Assert.Equal((3, "Années 80"), (theme.Round, theme.Name));
        Assert.Equal(theme, Assert.Single(play.Session.Themes!));
    }

    [Fact]
    public async Task UnThemeRenomme_LaPlaylistGardeLeNomDeSaCreation()
    {
        var play = await _gamer.LaunchAsync();

        await _game.Api.ExecuteAsync("UPDATE catalogue.themes SET name = 'Eighties' WHERE id = 1");

        var link = await _gamer.Client.GetFromJsonAsync<RunChallengeResponse>($"/api/runs/challenges/{play.Session.ChallengeCode}", Ct);
        Assert.Equal("Années 80", Assert.Single(link!.Themes!).Name);
    }

    [Fact]
    public async Task SansThemeAssezFourni_AucuneMancheATheme()
    {
        await _game.Api.ExecuteAsync("DELETE FROM catalogue.track_themes WHERE track_id > 25");

        var play = await _gamer.LaunchAsync();

        Assert.Null(play.Session.Themes);
        Assert.Equal(HttpStatusCode.OK, (await _gamer.Client.GetAsync($"/api/runs/challenges/{play.Session.ChallengeCode}", Ct)).StatusCode);
    }

    [Fact]
    public async Task LeCreateurSeVoitProposerLesThemesAssezFournis()
    {
        var offer = await _gamer.Client.GetFromJsonAsync<List<RunThemeOfferItem>>("/api/runs/theme-offer", Ct);

        Assert.Equal([new RunThemeOfferItem(1, "Années 80", 3)], offer);
    }

    [Fact]
    public async Task LeThemeChoisiAuLancement_PrendLaManche3_UnThemeInvalideEstIgnore()
    {
        await _game.Api.ExecuteAsync("INSERT INTO catalogue.track_themes (track_id, theme_id) SELECT id, 3 FROM catalogue.tracks WHERE id BETWEEN 40 AND 49");

        var chosen = await _gamer.Client.PostAsync("/api/runs/challenges?themeId=3", null, Ct);
        var play = await chosen.Content.ReadFromJsonAsync<RunPlayResponse>(Ct);
        Assert.Equal("Jazz", Assert.Single(play!.Session.Themes!).Name);

        var invalid = await _gamer.Client.PostAsync("/api/runs/challenges?themeId=2", null, Ct);
        Assert.Equal(HttpStatusCode.OK, invalid.StatusCode);
        var other = await invalid.Content.ReadFromJsonAsync<RunPlayResponse>(Ct);
        Assert.NotEqual("Films", Assert.Single(other!.Session.Themes!).Name);
    }
}
