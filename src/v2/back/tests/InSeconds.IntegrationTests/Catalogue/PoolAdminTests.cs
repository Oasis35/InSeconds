using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Testing.Deezer;
using Microsoft.Extensions.DependencyInjection;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>Le pool admin (<c>/api/admin/catalogue</c>) : ajout, liste, renommage, actualisation, désactivation, suppression.</summary>
public class PoolAdminTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Tracks = "/api/admin/catalogue/tracks";

    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    // ---------- Ajout ----------

    [Fact]
    public async Task Ajout_CaptureAnneeRangPochetteEtEtatDeLExtrait()
    {
        var track = await _app.AddAsync(1234);

        Assert.True(track.Id > 0);
        Assert.Equal(1234, track.DeezerTrackId);
        Assert.Equal("E2E Artist", track.Artist);
        Assert.Equal("E2E Track 1234", track.Title);
        Assert.Equal(2015, track.ReleaseYear);
        Assert.Equal(500_000 + 1234 % 1000, track.Rank);
        Assert.Equal("available", track.PreviewStatus);
        Assert.False(track.IsDisabled);
        Assert.Equal("https://cdn-images.dzcdn.net/images/cover/e2ecover1234/250x250-000000-80-0-0.jpg", track.CoverUrl);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM catalogue.tracks WHERE id = {track.Id} AND deezer_track_id = 1234 AND cover_hash = 'e2ecover1234' AND release_year = 2015 AND preview_checked_at IS NOT NULL AND rank_updated_at IS NOT NULL"));
    }

    [Fact]
    public async Task Ajout_MorceauSansExtrait_EtatAbsent()
    {
        var track = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 7);

        Assert.Equal("missing", track.PreviewStatus);
    }

    [Fact]
    public async Task Ajout_UnIdentifiantDejaDansLePool_409_PasDeSecondMorceau()
    {
        await _app.AddAsync(1234);
        var requestsBefore = _app.Deezer.Requests.Count;

        var response = await _app.Admin().PostAsJsonAsync(Tracks, new AddTrack(1234), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, CatalogueErrorCodes.DuplicateDeezerId);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM catalogue.tracks"));
        // Le doublon est vu avant d'interroger Deezer.
        Assert.Equal(requestsBefore, _app.Deezer.Requests.Count);
    }

    [Fact]
    public async Task Ajout_IntrouvableChezDeezer_422()
    {
        var response = await _app.Admin().PostAsJsonAsync(Tracks, new AddTrack(FakeDeezerHandler.NotFoundFrom + 1), Ct);

        await AssertProblemAsync(response, HttpStatusCode.UnprocessableEntity, CatalogueErrorCodes.NotFoundOnDeezer);
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM catalogue.tracks"));
    }

    [Fact]
    public async Task Ajout_DeezerIndisponible_503_QuotaDepasseNEstPasUnMorceauIntrouvable()
    {
        var response = await _app.Admin().PostAsJsonAsync(Tracks, new AddTrack(FakeDeezerHandler.QuotaFrom + 1), Ct);

        await AssertProblemAsync(response, HttpStatusCode.ServiceUnavailable, CatalogueErrorCodes.DeezerUnavailable);
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM catalogue.tracks"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public async Task Ajout_IdentifiantInvalide_400(long id) =>
        Assert.Equal(HttpStatusCode.BadRequest, (await _app.Admin().PostAsJsonAsync(Tracks, new AddTrack(id), Ct)).StatusCode);

    [Fact]
    public async Task Ajout_SixAjoutsSimultanesDuMemeIdentifiant_UnSeulMorceau_LesAutresRepondent409()
    {
        var admin = _app.Admin();

        var responses = await Task.WhenAll(Enumerable.Range(0, 6)
            .Select(_ => admin.PostAsJsonAsync(Tracks, new AddTrack(4321), Ct)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM catalogue.tracks"));
    }

    [Fact]
    public async Task Ajout_IndexUniqueFaceAUneCourse_409_PasUne500()
    {
        // Deux ajouts passent la vérification préalable (rien en base), attendent la réponse de Deezer, puis
        // s'enregistrent ensemble : seul l'index unique peut refuser le second (TrackConflictExceptionHandler).
        var gate = new TaskCompletionSource();
        _app.Deezer.Intercept = async (_, ct) =>
        {
            await gate.Task.WaitAsync(ct);
            return null;
        };
        var admin = _app.Admin();

        var first = admin.PostAsJsonAsync(Tracks, new AddTrack(7777), Ct);
        var second = admin.PostAsJsonAsync(Tracks, new AddTrack(7777), Ct);
        for (var waited = 0; _app.Deezer.Requests.Count < 2; waited += 20)
        {
            Assert.True(waited < 20_000, "Les deux ajouts n'ont pas atteint Deezer.");
            await Task.Delay(20, Ct);
        }

        gate.SetResult();
        var responses = await Task.WhenAll(first, second);

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        await AssertProblemAsync(responses.Single(r => r.StatusCode != HttpStatusCode.OK), HttpStatusCode.Conflict, CatalogueErrorCodes.DuplicateDeezerId);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM catalogue.tracks"));
    }

    // ---------- Liste ----------

    [Fact]
    public async Task Liste_TrieeParArtistePuisTitre_AvecEtatDeLExtrait_EtUsageAbsentParDefaut()
    {
        await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);
        await _app.AddAsync(1002);
        await _app.AddAsync(1001);

        var pool = await _app.ListAsync();

        Assert.Equal(["E2E Track 1001", "E2E Track 1002", $"E2E Track {FakeDeezerHandler.NoPreviewFrom + 1}"], pool.Select(t => t.Title));
        Assert.Equal(["available", "available", "missing"], pool.Select(t => t.PreviewStatus));
        Assert.All(pool, t =>
        {
            Assert.Equal(0, t.UsageCount);
            Assert.Null(t.LastUsedDate);
            Assert.Null(t.UnlockDate);
            Assert.False(t.InTodayChallenge);
            Assert.False(t.IsDisabled);
            Assert.NotNull(t.PreviewCheckedAt);
            Assert.Equal(2015, t.ReleaseYear);
        });
    }

    [Fact]
    public async Task Liste_JointLUsageDuJeu_DontInTodayChallenge()
    {
        var used = await _app.AddAsync(1001);
        var today = await _app.AddAsync(1002);
        await _app.AddAsync(1003);
        _app.Usage.Set(used.Id, new TrackUsage(new DateOnly(2026, 9, 20), 2, new DateOnly(2026, 10, 20), InTodayChallenge: false));
        _app.Usage.Set(today.Id, new TrackUsage(new DateOnly(2026, 10, 5), 1, new DateOnly(2026, 11, 4), InTodayChallenge: true));

        var pool = (await _app.ListAsync()).ToDictionary(t => t.Id);

        Assert.Equal(2, pool[used.Id].UsageCount);
        Assert.Equal(new DateOnly(2026, 9, 20), pool[used.Id].LastUsedDate);
        Assert.Equal(new DateOnly(2026, 10, 20), pool[used.Id].UnlockDate);
        Assert.False(pool[used.Id].InTodayChallenge);
        Assert.True(pool[today.Id].InTodayChallenge);
        Assert.Equal(3, pool.Count);
    }

    [Fact]
    public async Task Liste_MorceauDesactive_LeSignale()
    {
        var track = await _app.AddAsync(1001);
        await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}/disabled", new SetTrackDisabled(true), Ct);

        Assert.True(Assert.Single(await _app.ListAsync()).IsDisabled);
    }

    // ---------- Renommage : permis à tout moment, défi du jour compris ----------

    [Fact]
    public async Task Renommage_CorrigeArtisteEtTitre_RogneLesEspaces()
    {
        var track = await _app.AddAsync(1001);

        var response = await _app.Admin().PatchAsJsonAsync($"{Tracks}/{track.Id}", new RenameTrack("  Daft Punk ", " Around the World  "), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var renamed = (await response.Content.ReadFromJsonAsync<TrackSummary>(Ct))!;
        Assert.Equal("Daft Punk", renamed.Artist);
        Assert.Equal("Around the World", renamed.Title);
        Assert.Equal(1001, renamed.DeezerTrackId);
    }

    [Fact]
    public async Task Renommage_MorceauDuDefiDuJourEnCours_Reussit_AucunVerrou_LeNouveauNomEstServi()
    {
        // Le ticket C1 : « renommer un morceau du défi du jour en cours ». Plus de catalogue.track_locked (PR v1 #246).
        var track = await _app.AddAsync(1001);
        _app.Usage.Set(track.Id, new TrackUsage(new DateOnly(2026, 10, 5), 1, new DateOnly(2026, 11, 4), InTodayChallenge: true));
        Assert.True(Assert.Single(await _app.ListAsync()).InTodayChallenge);

        var response = await _app.Admin().PatchAsJsonAsync($"{Tracks}/{track.Id}", new RenameTrack("Artiste corrigé", "Titre corrigé"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var listed = Assert.Single(await _app.ListAsync());
        Assert.Equal("Artiste corrigé", listed.Artist);
        Assert.Equal("Titre corrigé", listed.Title);
        Assert.True(listed.InTodayChallenge);
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>(
            "SELECT count(*) FROM catalogue.tracks WHERE artist = 'E2E Artist' OR title LIKE 'E2E Track%'"));
        // Pas de code de verrou publié.
        Assert.DoesNotContain("track_locked", await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Renommage_MorceauDejaUtilise_AussiPermis()
    {
        var track = await _app.AddAsync(1001);
        _app.Usage.Set(track.Id, new TrackUsage(new DateOnly(2026, 9, 1), 4, new DateOnly(2026, 10, 1), InTodayChallenge: false));

        var response = await _app.Admin().PatchAsJsonAsync($"{Tracks}/{track.Id}", new RenameTrack("A", "T"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Renommage_MorceauInconnu_404() =>
        await AssertProblemAsync(await _app.Admin().PatchAsJsonAsync($"{Tracks}/99999", new RenameTrack("A", "T"), Ct), HttpStatusCode.NotFound, "common.not_found");

    [Theory]
    [InlineData("", "Titre")]
    [InlineData("Artiste", "   ")]
    public async Task Renommage_NomVide_400_RienNeChange(string artist, string title)
    {
        var track = await _app.AddAsync(1001);

        var response = await _app.Admin().PatchAsJsonAsync($"{Tracks}/{track.Id}", new RenameTrack(artist, title), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("E2E Artist", Assert.Single(await _app.ListAsync()).Artist);
    }

    [Fact]
    public async Task Renommage_NomTropLong_400()
    {
        var track = await _app.AddAsync(1001);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await _app.Admin().PatchAsJsonAsync($"{Tracks}/{track.Id}", new RenameTrack(new string('a', 201), "T"), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await _app.Admin().PatchAsJsonAsync($"{Tracks}/{track.Id}", new RenameTrack("A", new string('t', 301)), Ct)).StatusCode);
    }

    // ---------- Actualisation (PUT) ----------

    [Fact]
    public async Task Actualisation_RemplaceIdentifiantNomsPochetteAnneeRangEtExtrait()
    {
        var track = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);
        Assert.Equal("missing", track.PreviewStatus);

        var response = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}", new UpdateTrack(2002), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<TrackSummary>(Ct))!;
        Assert.Equal(track.Id, updated.Id);
        Assert.Equal(2002, updated.DeezerTrackId);
        Assert.Equal("E2E Track 2002", updated.Title);
        Assert.Equal("available", updated.PreviewStatus);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM catalogue.tracks WHERE id = {track.Id} AND deezer_track_id = 2002 AND cover_hash = 'e2ecover2002' AND updated_at IS NOT NULL"));
    }

    [Fact]
    public async Task Actualisation_MorceauDejaUtilise_409_TrackInUse()
    {
        var track = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);
        _app.Usage.Set(track.Id, new TrackUsage(new DateOnly(2026, 9, 1), 1, new DateOnly(2026, 10, 1), InTodayChallenge: false));

        var response = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}", new UpdateTrack(2002), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, CatalogueErrorCodes.TrackInUse);
        Assert.Equal(FakeDeezerHandler.NoPreviewFrom + 1, Assert.Single(await _app.ListAsync()).DeezerTrackId);
    }

    [Fact]
    public async Task Actualisation_IdentifiantPrisParUnAutreMorceau_409()
    {
        var track = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);
        await _app.AddAsync(2002);

        var response = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}", new UpdateTrack(2002), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, CatalogueErrorCodes.DuplicateDeezerId);
    }

    [Fact]
    public async Task Actualisation_MemeIdentifiant_ReleitDeezer_SansConflitAvecLuiMeme()
    {
        var track = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);

        var response = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}", new UpdateTrack(FakeDeezerHandler.NoPreviewFrom + 1), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Actualisation_IntrouvableChezDeezer_422_DeezerIndisponible_503_MorceauInconnu_404()
    {
        var track = await _app.AddAsync(1001);

        await AssertProblemAsync(await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}", new UpdateTrack(FakeDeezerHandler.NotFoundFrom + 1), Ct),
            HttpStatusCode.UnprocessableEntity, CatalogueErrorCodes.NotFoundOnDeezer);
        await AssertProblemAsync(await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}", new UpdateTrack(FakeDeezerHandler.QuotaFrom + 1), Ct),
            HttpStatusCode.ServiceUnavailable, CatalogueErrorCodes.DeezerUnavailable);
        await AssertProblemAsync(await _app.Admin().PutAsJsonAsync($"{Tracks}/99999", new UpdateTrack(2002), Ct),
            HttpStatusCode.NotFound, "common.not_found");
        Assert.Equal(1001, Assert.Single(await _app.ListAsync()).DeezerTrackId);
    }

    // ---------- Désactivation ----------

    [Fact]
    public async Task Desactivation_PuisReactivation()
    {
        var track = await _app.AddAsync(1001);

        var disabled = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}/disabled", new SetTrackDisabled(true), Ct);
        Assert.Equal(new TrackDisabledResponse(track.Id, true), await disabled.Content.ReadFromJsonAsync<TrackDisabledResponse>(Ct));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM catalogue.tracks WHERE id = {track.Id} AND disabled_at IS NOT NULL"));

        var enabled = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}/disabled", new SetTrackDisabled(false), Ct);
        Assert.Equal(new TrackDisabledResponse(track.Id, false), await enabled.Content.ReadFromJsonAsync<TrackDisabledResponse>(Ct));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM catalogue.tracks WHERE id = {track.Id} AND disabled_at IS NULL"));
    }

    [Fact]
    public async Task Desactivation_MorceauDuDefiDuJour_409_ReactivationToujoursPermise()
    {
        var track = await _app.AddAsync(1001);
        _app.Usage.Set(track.Id, new TrackUsage(new DateOnly(2026, 10, 5), 1, new DateOnly(2026, 11, 4), InTodayChallenge: true));

        await AssertProblemAsync(await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}/disabled", new SetTrackDisabled(true), Ct),
            HttpStatusCode.Conflict, CatalogueErrorCodes.TrackInTodayChallenge);
        Assert.False(Assert.Single(await _app.ListAsync()).IsDisabled);

        // Désactivé avant d'entrer dans le défi du jour (cas du lendemain) : le remettre est toujours permis.
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET disabled_at = now() WHERE id = {track.Id}");
        var enabled = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}/disabled", new SetTrackDisabled(false), Ct);
        Assert.Equal(HttpStatusCode.OK, enabled.StatusCode);
        Assert.False(Assert.Single(await _app.ListAsync()).IsDisabled);
    }

    [Fact]
    public async Task Desactivation_MorceauDejaDesactiveDuDefiDuJour_RedesactiverNeLeveAucuneErreur()
    {
        var track = await _app.AddAsync(1001);
        await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}/disabled", new SetTrackDisabled(true), Ct);
        _app.Usage.Set(track.Id, new TrackUsage(new DateOnly(2026, 10, 5), 1, new DateOnly(2026, 11, 4), InTodayChallenge: true));

        var again = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}/disabled", new SetTrackDisabled(true), Ct);

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
    }

    [Fact]
    public async Task Desactivation_MorceauDejaUtilise_Permise()
    {
        var track = await _app.AddAsync(1001);
        _app.Usage.Set(track.Id, new TrackUsage(new DateOnly(2026, 9, 1), 3, new DateOnly(2026, 10, 1), InTodayChallenge: false));

        var response = await _app.Admin().PutAsJsonAsync($"{Tracks}/{track.Id}/disabled", new SetTrackDisabled(true), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Desactivation_MorceauInconnu_404() =>
        await AssertProblemAsync(await _app.Admin().PutAsJsonAsync($"{Tracks}/99999/disabled", new SetTrackDisabled(true), Ct), HttpStatusCode.NotFound, "common.not_found");

    // ---------- Suppression ----------

    [Fact]
    public async Task Suppression_MorceauJamaisUtilise_204_ReelementSupprime()
    {
        var track = await _app.AddAsync(1001);

        var response = await _app.Admin().DeleteAsync($"{Tracks}/{track.Id}", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await _app.ListAsync());
    }

    [Fact]
    public async Task Suppression_MorceauDejaUtilise_409_TrackInUse_LeMorceauReste()
    {
        var track = await _app.AddAsync(1001);
        _app.Usage.Set(track.Id, new TrackUsage(new DateOnly(2026, 9, 1), 1, new DateOnly(2026, 10, 1), InTodayChallenge: false));

        await AssertProblemAsync(await _app.Admin().DeleteAsync($"{Tracks}/{track.Id}", Ct), HttpStatusCode.Conflict, CatalogueErrorCodes.TrackInUse);

        Assert.Single(await _app.ListAsync());
    }

    [Fact]
    public async Task Suppression_MorceauInconnu_404() =>
        await AssertProblemAsync(await _app.Admin().DeleteAsync($"{Tracks}/99999", Ct), HttpStatusCode.NotFound, "common.not_found");

    // ---------- Recherche admin : titres bruts ----------

    [Fact]
    public async Task RechercheAdmin_TitresBrutsDeDeezer_AvecExtraitAnneeEtRang_SansNettoyageNiDeduplication()
    {
        var results = (await _app.Admin().GetFromJsonAsync<List<DeezerTrackResult>>("/api/admin/catalogue/deezer-search?q=dedup-test", Ct))!;

        Assert.Equal(
            ["E2E Track (Remastered 2011)", "E2E Track (Live)", "E2E Track", "Another Track"],
            results.Select(r => r.Title));
        Assert.All(results, r => Assert.StartsWith("http", r.PreviewUrl, StringComparison.Ordinal));
        Assert.Equal([400_000, 300_000, 200_000, 100_000], results.Select(r => r.Rank));
    }

    [Fact]
    public async Task RechercheAdmin_NePasseParLeCache_ChaqueRechercheVaChezDeezer()
    {
        var admin = _app.Admin();

        await admin.GetAsync("/api/admin/catalogue/deezer-search?q=dedup-test", Ct);
        await admin.GetAsync("/api/admin/catalogue/deezer-search?q=dedup-test", Ct);

        Assert.Equal(2, _app.Deezer.Requests.Count(r => r.StartsWith("/search", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task RechercheAdmin_RequeteTropLongue_ListeVide_SansAppelerDeezer()
    {
        var q = new string('a', 101);

        Assert.Empty((await _app.Admin().GetFromJsonAsync<List<DeezerTrackResult>>($"/api/admin/catalogue/deezer-search?q={q}", Ct))!);
        Assert.Empty(_app.Deezer.Requests);
    }

    [Fact]
    public async Task Ajout_NomsBlancsChezDeezer_422_PasUne500()
    {
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"id\":5555,\"title\":\"   \",\"preview\":\"p\",\"artist\":{\"name\":\"A\"}}", System.Text.Encoding.UTF8, "application/json"),
        });

        var response = await _app.Admin().PostAsJsonAsync(Tracks, new AddTrack(5555), Ct);

        await AssertProblemAsync(response, HttpStatusCode.UnprocessableEntity, CatalogueErrorCodes.NotFoundOnDeezer);
    }

    [Fact]
    public async Task Ajout_AnneeInconnueChezDeezer_PasDAnneeZero()
    {
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"id\":5556,\"title\":\"T\",\"preview\":\"p\",\"release_date\":\"0000-00-00\",\"artist\":{\"name\":\"A\"}}", System.Text.Encoding.UTF8, "application/json"),
        });

        var track = await _app.AddAsync(5556);

        Assert.Null(track.ReleaseYear);
    }

    [Fact]
    public async Task RechercheAdmin_RequeteCourte_ListeVide()
    {
        Assert.Empty((await _app.Admin().GetFromJsonAsync<List<DeezerTrackResult>>("/api/admin/catalogue/deezer-search?q=a", Ct))!);
        Assert.Empty(_app.Deezer.Requests);
    }

    // ---------- Contrat : lecture des morceaux par les autres modules ----------

    [Fact]
    public async Task ITrackDirectory_TitreAffichableNettoye_PochetteDuGabarit_AnneeEtIdentifiantDeezer()
    {
        var track = await _app.AddAsync(1001);
        await _app.Admin().PatchAsJsonAsync($"{Tracks}/{track.Id}", new RenameTrack("Daft Punk", "One More Time (Radio Edit)"), Ct);

        await using var scope = _app.Api.Services.CreateAsyncScope();
        var directory = scope.ServiceProvider.GetRequiredService<ITrackDirectory>();
        var found = await directory.GetAsync([track.Id, 99999], Ct);

        var info = Assert.Single(found).Value;
        Assert.Equal(new TrackInfo(
            track.Id, 1001, "Daft Punk", "One More Time (Radio Edit)", "One More Time",
            "https://cdn-images.dzcdn.net/images/cover/e2ecover1001/250x250-000000-80-0-0.jpg", 2015), info);
    }

    [Fact]
    public async Task GabaritDePochette_LuADChaud_DansInfraSettings()
    {
        var track = await _app.AddAsync(1001);
        await _app.Api.ExecuteAsync(
            "INSERT INTO infra.settings (key, value, updated_at) VALUES ('Catalogue:CoverUrlTemplate', '\"https://cdn.example/{hash}/big.jpg\"', now())");
        await using var scope = _app.Api.Services.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<InSeconds.Api.Infrastructure.Settings.ISettingsReloader>().Reload();

        Assert.Equal("https://cdn.example/e2ecover1001/big.jpg", Assert.Single(await _app.ListAsync()).CoverUrl);
        Assert.NotNull(track);
    }
}
