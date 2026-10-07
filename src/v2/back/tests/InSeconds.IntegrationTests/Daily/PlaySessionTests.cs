using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Jouer une partie (E2) : écouter, demander un indice, répondre, abandonner. Le verrou du morceau (piège 35), le plancher d'écoute, le score,
/// l'indice payé, la fin de partie sur le nombre réel de morceaux (piège 38).
/// </summary>
public class PlaySessionTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;
    private Gamer _alice = null!;
    private int _session;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());
        _alice = await _game.NewPlayerAsync();
        await _game.GenerateAsync();
        _session = (await _alice.StartAsync()).SessionId;
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    // --- le score ---

    [Theory]
    [InlineData(0.5, true, true, 1000)]
    [InlineData(1, true, true, 850)]
    [InlineData(10, true, true, 100)]
    [InlineData(1, true, false, 425)] // un seul des deux : la moitié
    [InlineData(2, false, true, 275)]
    [InlineData(1, false, false, 0)]
    public async Task Score_ParPalier_EtScorePartiel(double seconds, bool artistOk, bool titleOk, int expected)
    {
        var trackId = await _game.TrackAtAsync(Today, 1);

        var response = await _alice.AnswerAsync(
            _session, 1, (decimal)seconds, artistOk ? $"Artiste {trackId}" : "Zzzz", titleOk ? $"Titre {trackId}" : "Yyyy");

        var answer = await ReadAnswerAsync(response);
        Assert.Equal((artistOk, titleOk, expected), (answer.ArtistCorrect, answer.TitleCorrect, answer.Score));
        Assert.Equal((decimal)seconds, answer.ListenedSeconds);
    }

    [Fact]
    public async Task Reponse_RevèleLeMorceau_EtCeQuEnOntFaitLesAutres()
    {
        var bob = await _game.NewPlayerAsync();
        var bobSession = (await bob.StartAsync()).SessionId;
        await bob.AnswerCorrectlyAsync(bobSession, 1, 2);
        var trackId = await _game.TrackAtAsync(Today, 1);

        var answer = await ReadAnswerAsync(await _alice.AnswerAsync(_session, 1, 1, $"Artiste {trackId}", "Zzzz"));

        Assert.Equal(($"Artiste {trackId}", $"Titre {trackId}", 1000L + trackId), (answer.CorrectArtist, answer.CorrectTitle, answer.DeezerTrackId));
        // Un autre joueur a trouvé à 2 s, celui-ci (artiste seul) à 1 s : deux trouvés, aucun échec, moyenne 1,5 s.
        Assert.Equal(1.5, answer.AverageSecondsWhenCorrect);
        Assert.Equal(0, answer.FailureRatePercent);
        Assert.Equal(0, answer.NotFoundCount);
        Assert.Equal([0.5m, 1m, 1.5m, 2m, 3m, 5m, 10m], answer.GuessTimeDistribution.Select(b => b.DurationSeconds));
        Assert.Equal([0, 1, 0, 1, 0, 0, 0], answer.GuessTimeDistribution.Select(b => b.Count));
    }

    [Fact]
    public async Task Reponse_NeTrouvePas_CompteDansLesEchecs()
    {
        var answer = await ReadAnswerAsync(await _alice.AnswerAsync(_session, 1, 1, "Zzzz", "Yyyy"));

        Assert.Equal((0, 100d, 1), (answer.Score, answer.FailureRatePercent, answer.NotFoundCount));
        Assert.Null(answer.AverageSecondsWhenCorrect);
    }

    [Fact]
    public async Task Reponse_MorceauSansExtrait_Passe_A0Point()
    {
        // Le joueur passe un morceau sans extrait : palier 0, rien de trouvé.
        var answer = await ReadAnswerAsync(await _alice.AnswerAsync(_session, 1, 0, null, null));

        Assert.Equal((0, 0m), (answer.Score, answer.ListenedSeconds));
    }

    // --- le plancher d'écoute ---

    [Fact]
    public async Task Plancher_PalierAnnonceSousLaDureeEcoutee_400_EtLaPartieNAvancePas()
    {
        await _alice.ListenAsync(_session, 1, 3);

        var response = await _alice.AnswerAsync(_session, 1, 0.5m, "Artiste 1", "Titre 1");

        await GameAsserts.ProblemAsync(response, HttpStatusCode.BadRequest, "daily.listened_duration_below_verified_minimum");
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
        Assert.Equal(HttpStatusCode.OK, (await _alice.AnswerAsync(_session, 1, 3, "Zzzz", "Yyyy")).StatusCode);
    }

    [Fact]
    public async Task Plancher_GardeLeMaximum_UneEcouteMoinsLongueNeLeReduitPas()
    {
        await _alice.ListenAsync(_session, 1, 5);
        await _alice.ListenAsync(_session, 1, 1);

        Assert.Equal(5m, await _game.Api.ScalarAsync<decimal>($"SELECT current_listened_seconds FROM daily.sessions WHERE id = {_session}"));
        await GameAsserts.ProblemAsync(
            await _alice.AnswerAsync(_session, 1, 2, "x", "y"), HttpStatusCode.BadRequest, "daily.listened_duration_below_verified_minimum");
    }

    [Fact]
    public async Task Plancher_SansEcouteEnregistree_AucunPlancher()
    {
        // Jamais de « PATCH listening » sur ce morceau : rien à comparer, la réponse passe (comme un morceau sans extrait).
        Assert.Equal(HttpStatusCode.OK, (await _alice.AnswerAsync(_session, 1, 0.5m, "x", "y")).StatusCode);
    }

    // --- le verrou du morceau (piège 35) ---

    [Fact]
    public async Task Verrou_UnAutreMorceauQueLeMorceauEnCours_409()
    {
        await _alice.ListenAsync(_session, 1, 5);

        await GameAsserts.ProblemAsync(await _alice.ListenAsync(_session, 2, 0.5m), HttpStatusCode.Conflict, "daily.track_lock_not_released");
        await GameAsserts.ProblemAsync(await _alice.HintAsync(_session, 2, 1), HttpStatusCode.Conflict, "daily.track_lock_not_released");
        await GameAsserts.ProblemAsync(await _alice.AnswerAsync(_session, 2, 1, "x", "y"), HttpStatusCode.Conflict, "daily.track_lock_not_released");
        // Le verrou n'a pas bougé : l'indice et le plancher du morceau 1 sont intacts.
        Assert.Equal((short)1, await _game.Api.ScalarAsync<short>($"SELECT current_position FROM daily.sessions WHERE id = {_session}"));
        Assert.Equal(5m, await _game.Api.ScalarAsync<decimal>($"SELECT current_listened_seconds FROM daily.sessions WHERE id = {_session}"));
    }

    [Fact]
    public async Task Verrou_MorceauDejaRepondu_409AlreadyAnswered()
    {
        await _alice.AnswerCorrectlyAsync(_session, 1, 1);

        await GameAsserts.ProblemAsync(await _alice.AnswerAsync(_session, 1, 1, "x", "y"), HttpStatusCode.Conflict, "daily.already_answered");
        await GameAsserts.ProblemAsync(await _alice.ListenAsync(_session, 1, 1), HttpStatusCode.Conflict, "daily.already_answered");
        await GameAsserts.ProblemAsync(await _alice.HintAsync(_session, 1, 1), HttpStatusCode.Conflict, "daily.already_answered");
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
    }

    [Fact]
    public async Task Verrou_MorceauInconnuDuDefi_404()
    {
        await GameAsserts.ProblemAsync(await _alice.ListenAsync(_session, 9, 1), HttpStatusCode.NotFound, "daily.track_not_found");
        await GameAsserts.ProblemAsync(await _alice.AnswerAsync(_session, 6, 1, "x", "y"), HttpStatusCode.NotFound, "daily.track_not_found");
    }

    [Fact]
    public async Task Verrou_LeMorceauSuivant_SeLibereAvecLaReponse_EtRepartASonPlancher()
    {
        await _alice.ListenAsync(_session, 1, 10);
        await _alice.HintAsync(_session, 1, 2);
        await _alice.AnswerCorrectlyAsync(_session, 1, 10);

        // Plus de verrou, plus d'indice, plus de plancher : le morceau 2 repart de zéro.
        Assert.Null(await _game.Api.ScalarAsync<short?>($"SELECT current_position FROM daily.sessions WHERE id = {_session}"));
        Assert.Equal((short)0, await _game.Api.ScalarAsync<short>($"SELECT current_hint_level FROM daily.sessions WHERE id = {_session}"));
        Assert.Equal(HttpStatusCode.NoContent, (await _alice.ListenAsync(_session, 2, 0.5m)).StatusCode);
        var second = await ReadAnswerAsync(await _alice.AnswerAsync(_session, 2, 0.5m, "x", "y"));
        Assert.Equal(0, second.HintLevelUsed);
    }

    [Fact]
    public async Task Reponse_EnvoyeeDeuxFoisEnMemeTemps_UneSeuleEstEnregistree()
    {
        var trackId = await _game.TrackAtAsync(Today, 1);

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => _alice.AnswerAsync(_session, 1, 1, $"Artiste {trackId}", $"Titre {trackId}")));

        // Une réponse acceptée, les autres refusées proprement (jamais une erreur 500 sur la clé unique), et un seul score compté.
        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
        Assert.Equal(850, await _game.Api.ScalarAsync<int>($"SELECT total_score FROM daily.sessions WHERE id = {_session}"));
    }

    // --- les indices ---

    [Fact]
    public async Task Indice_TantQueLePalierNEstPasAtteint_409HintLocked()
    {
        await GameAsserts.ProblemAsync(await _alice.HintAsync(_session, 1, 1), HttpStatusCode.Conflict, "daily.hint_locked");

        await _alice.ListenAsync(_session, 1, 3);
        await GameAsserts.ProblemAsync(await _alice.HintAsync(_session, 1, 1), HttpStatusCode.Conflict, "daily.hint_locked");

        await _alice.ListenAsync(_session, 1, 5);
        Assert.Equal(HttpStatusCode.OK, (await _alice.HintAsync(_session, 1, 1)).StatusCode);
        await GameAsserts.ProblemAsync(await _alice.HintAsync(_session, 1, 2), HttpStatusCode.Conflict, "daily.hint_locked");
    }

    [Fact]
    public async Task Indice_RendLAnneeEtLArtisteMasque_Cumulatif()
    {
        var trackId = await _game.TrackAtAsync(Today, 1);
        await _game.Api.ExecuteAsync($"UPDATE catalogue.tracks SET release_year = 1999 WHERE id = {trackId}");
        await _alice.ListenAsync(_session, 1, 10);

        var level1 = await ReadHintAsync(await _alice.HintAsync(_session, 1, 1));
        var level2 = await ReadHintAsync(await _alice.HintAsync(_session, 1, 2));

        Assert.Equal([("year", "1999")], level1.Select(f => (f.Kind, f.Value)));
        // Le niveau 2 rend aussi l'année, que le niveau 1 ait été demandé ou non.
        Assert.Equal(["year", "artistMasked"], level2.Select(f => f.Kind));
        Assert.StartsWith("A _ _ _ _ _ _", level2[1].Value, StringComparison.Ordinal);
        // Le nom entier n'est jamais envoyé.
        Assert.DoesNotContain("Artiste", level2[1].Value!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Indice_AnneeInconnue_ValeurVide()
    {
        await _alice.ListenAsync(_session, 1, 5);

        var facts = await ReadHintAsync(await _alice.HintAsync(_session, 1, 1));

        Assert.Null(Assert.Single(facts).Value);
    }

    [Fact]
    public async Task Indice_DemandeDirectementLeNiveau2_EtRedemanderLeNiveau1_GardeLeMax()
    {
        await _alice.ListenAsync(_session, 1, 10);
        await _alice.HintAsync(_session, 1, 2);
        await _alice.HintAsync(_session, 1, 1);

        Assert.Equal((short)2, await _game.Api.ScalarAsync<short>($"SELECT current_hint_level FROM daily.sessions WHERE id = {_session}"));
    }

    [Fact]
    public async Task Indice_NiveauInexistant_400()
    {
        await _alice.ListenAsync(_session, 1, 10);

        Assert.Equal(HttpStatusCode.BadRequest, (await _alice.HintAsync(_session, 1, 3)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _alice.HintAsync(_session, 1, 0)).StatusCode);
    }

    [Fact]
    public async Task Indice_EcouterPlusNeLeRevelePas_EtLePrixEstCelDuClic()
    {
        var trackId = await _game.TrackAtAsync(Today, 1);
        await _alice.ListenAsync(_session, 1, 10);

        // Écouter jusqu'à 10 s ne révèle rien et ne coûte rien : seul le clic explicite révèle.
        var free = await ReadAnswerAsync(await _alice.AnswerAsync(_session, 1, 10, $"Artiste {trackId}", $"Titre {trackId}"));

        Assert.Equal((100, 0, 0), (free.Score, free.HintLevelUsed, free.HintPenaltyPercentApplied));
    }

    [Theory]
    [InlineData(5, 1, 175, 30)] // 250 × 0,7
    [InlineData(10, 1, 70, 30)] // 100 × 0,7
    [InlineData(10, 2, 40, 60)] // 100 × 0,4
    public async Task Indice_PayeSurLePalierReellementAtteint(int seconds, int level, int expectedScore, int expectedPenalty)
    {
        var trackId = await _game.TrackAtAsync(Today, 1);
        await _alice.ListenAsync(_session, 1, seconds);
        await _alice.HintAsync(_session, 1, level);

        // Le niveau d'indice n'est jamais envoyé par le client : il vient de la partie.
        var answer = await ReadAnswerAsync(await _alice.AnswerAsync(_session, 1, seconds, $"Artiste {trackId}", $"Titre {trackId}"));

        Assert.Equal((expectedScore, level, expectedPenalty), (answer.Score, answer.HintLevelUsed, answer.HintPenaltyPercentApplied));
        Assert.Equal((short)level, await _game.Api.ScalarAsync<short>($"SELECT hint_level FROM daily.answers WHERE session_id = {_session}"));
    }

    // --- la fin de partie ---

    [Fact]
    public async Task FinDePartie_SurLeDernierMorceau_ScoreTotalEtStatut()
    {
        await _alice.FinishAsync(_session, count: 4);
        Assert.Equal((short)0, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {_session}"));

        var last = await _alice.AnswerCorrectlyAsync(_session, 5, 1);

        Assert.True(last.Completed);
        Assert.Equal((short)1, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {_session}"));
        Assert.Equal(5 * 850, await _game.Api.ScalarAsync<int>($"SELECT total_score FROM daily.sessions WHERE id = {_session}"));
        Assert.Equal(5m, await _game.Api.ScalarAsync<decimal>($"SELECT total_listened_seconds FROM daily.sessions WHERE id = {_session}"));
        Assert.NotNull(await _game.Api.ScalarAsync<DateTime?>($"SELECT ended_at FROM daily.sessions WHERE id = {_session}"));
    }

    [Fact]
    public async Task FinDePartie_SurLeNombreReelDeMorceauxDuDefi_PasSurLeReglage_Piege38()
    {
        // Le réglage passe à 3 après la génération d'un défi de 5 morceaux : la partie se termine quand même au cinquième.
        await _game.SetSettingAsync("Daily:TracksPerChallenge", "3");

        var done = await _alice.FinishAsync(_session, count: 3);
        Assert.False(done.Completed);
        Assert.Equal((short)0, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {_session}"));
        await _alice.FinishAsync(_session, fromPosition: 4, count: 5);

        Assert.Equal((short)1, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {_session}"));
    }

    [Fact]
    public async Task PartieTerminee_NAccepteRien_409AlreadyPlayed()
    {
        await _alice.FinishAsync(_session);

        await GameAsserts.ProblemAsync(await _alice.AnswerAsync(_session, 5, 1, "x", "y"), HttpStatusCode.Conflict, "daily.already_played");
        await GameAsserts.ProblemAsync(await _alice.ListenAsync(_session, 1, 1), HttpStatusCode.Conflict, "daily.already_played");
        await GameAsserts.ProblemAsync(await _alice.HintAsync(_session, 1, 1), HttpStatusCode.Conflict, "daily.already_played");
        await GameAsserts.ProblemAsync(await _alice.AbandonAsync(_session), HttpStatusCode.Conflict, "daily.already_played");
    }

    // --- l'abandon ---

    [Fact]
    public async Task Abandon_204_LaPartieNeSeRejouePas_EtNAccepteRien()
    {
        await _alice.AnswerCorrectlyAsync(_session, 1, 1);

        Assert.Equal(HttpStatusCode.NoContent, (await _alice.AbandonAsync(_session)).StatusCode);

        Assert.Equal((short)2, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {_session}"));
        await GameAsserts.ProblemAsync(await _alice.AnswerAsync(_session, 2, 1, "x", "y"), HttpStatusCode.Conflict, "daily.abandoned");
        await GameAsserts.ProblemAsync(await _alice.AbandonAsync(_session), HttpStatusCode.Conflict, "daily.abandoned");
        await GameAsserts.ProblemAsync(await _alice.StartRawAsync(), HttpStatusCode.Conflict, "daily.abandoned");
    }

    // --- le renommage d'un morceau du défi du jour (PR v1 #246) ---

    [Fact]
    public async Task Renommage_LesReponsesDejaDonneesGardentLeurVerdict_LesSuivantesSontCorrigeesAvecLeNouveauNom()
    {
        var first = await _game.TrackAtAsync(Today, 1);
        var second = await _game.TrackAtAsync(Today, 2);
        var kept = await _alice.AnswerCorrectlyAsync(_session, 1, 1);

        var admin = _game.App.Admin();
        await admin.PatchAsJsonAsync($"/api/admin/catalogue/tracks/{first}", new { artist = "Premier Nom", title = "Premier Titre" }, Ct);
        await admin.PatchAsJsonAsync($"/api/admin/catalogue/tracks/{second}", new { artist = "Second Nom", title = "Second Titre" }, Ct);

        // L'ancien nom ne vaut plus pour le morceau 2, le nouveau oui.
        var old = await ReadAnswerAsync(await _alice.AnswerAsync(_session, 2, 1, $"Artiste {second}", $"Titre {second}"));
        Assert.Equal((false, false), (old.ArtistCorrect, old.TitleCorrect));
        Assert.Equal(("Second Nom", "Second Titre"), (old.CorrectArtist, old.CorrectTitle));
        var renamed = await ReadAnswerAsync(await _alice.AnswerAsync(_session, 3, 1, $"Artiste {await _game.TrackAtAsync(Today, 3)}", "x"));
        Assert.True(renamed.ArtistCorrect);

        // La réponse déjà donnée sur le morceau 1 garde son verdict et son score ; le nom affiché, lui, est le nouveau.
        var resumed = await _alice.StartAsync();
        var done = resumed.CompletedAnswers.Single(a => a.Position == 1);
        Assert.Equal((true, true, kept.Score), (done.ArtistCorrect, done.TitleCorrect, done.Score));
        Assert.Equal(("Premier Nom", "Premier Titre"), (done.CorrectArtist, done.CorrectTitle));
    }

    // --- les autres joueurs ---

    [Fact]
    public async Task UneAutrePartie_EstUnePartieInconnue_404_RienNEstRevele()
    {
        var bob = await _game.NewPlayerAsync();

        await GameAsserts.ProblemAsync(await bob.AnswerAsync(_session, 1, 1, "x", "y"), HttpStatusCode.NotFound, "daily.session_not_found");
        await GameAsserts.ProblemAsync(await bob.ListenAsync(_session, 1, 1), HttpStatusCode.NotFound, "daily.session_not_found");
        await GameAsserts.ProblemAsync(await bob.HintAsync(_session, 1, 1), HttpStatusCode.NotFound, "daily.session_not_found");
        await GameAsserts.ProblemAsync(await bob.AbandonAsync(_session), HttpStatusCode.NotFound, "daily.session_not_found");
        await GameAsserts.ProblemAsync(await _alice.AnswerAsync(99999, 1, 1, "x", "y"), HttpStatusCode.NotFound, "daily.session_not_found");
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
    }

    [Fact]
    public async Task SansIdentite_401_SurChaqueRoute()
    {
        var anonymous = _game.Api.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"/api/daily/sessions/{_session}/answers", new SubmitAnswer(1, 1, false, "x", "y"), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PatchAsJsonAsync($"/api/daily/sessions/{_session}/listening", new UpdateListening(1, 1), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"/api/daily/sessions/{_session}/hints", new RequestHint(1, 1), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync($"/api/daily/sessions/{_session}/abandon", null, Ct)).StatusCode);
    }

    // --- les valeurs refusées ---

    [Fact]
    public async Task PalierNonAutorise_400()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _alice.ListenAsync(_session, 1, 4)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _alice.AnswerAsync(_session, 1, 4, "x", "y")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _alice.AnswerAsync(_session, 1, -1, "x", "y")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _alice.AnswerAsync(_session, 1, 1, new string('a', 201), "y")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _alice.AnswerAsync(_session, 1, 1, "x", new string('a', 301))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _alice.AnswerAsync(_session, 0, 1, "x", "y")).StatusCode);
    }

    [Fact]
    public async Task Reponse_NeStockeQueCeQueLeJoueurATape_EtJamaisDansLeJournal()
    {
        await _alice.AnswerAsync(_session, 1, 1, "Mon Artiste Secret", "Mon Titre Secret");

        Assert.Equal("Mon Artiste Secret", await _game.Api.ScalarAsync<string>("SELECT artist_answer FROM daily.answers"));
        Assert.NotNull(await _game.Api.ScalarAsync<DateTime?>("SELECT answered_at FROM daily.answers"));
    }

    private static async Task<SubmitAnswerResponse> ReadAnswerAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SubmitAnswerResponse>(Ct))!;
    }

    private static async Task<IReadOnlyList<HintFactResponse>> ReadHintAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<HintResponse>(Ct))!.Facts;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
