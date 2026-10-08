using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Démarrer, reprendre et expirer une partie (E2, § 5.6 du plan v2). Le front ne démarre qu'au clic ; la lecture du jour (<c>GET /api/daily/today</c>)
/// ne crée rien et ne génère rien.
/// </summary>
public class StartSessionTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    [Fact]
    public async Task Demarrer_SansIdentite_401()
    {
        var response = await _game.Api.CreateClient().PostAsync("/api/daily/sessions", null, Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.sessions"));
    }

    [Fact]
    public async Task Demarrer_SansDefi_LeGenereALaVolee_EtJoueLesMemesMorceauxQuePourTous()
    {
        var alice = await _game.NewPlayerAsync();
        var bob = await _game.NewPlayerAsync();

        var first = await alice.StartAsync();
        var second = await bob.StartAsync();

        Assert.False(first.IsResuming);
        Assert.Equal(1, first.NextPosition);
        Assert.Equal([1, 2, 3, 4, 5], first.Tracks.Select(t => t.Position));
        Assert.All(first.Tracks, t => Assert.StartsWith("http", t.PreviewUrl));
        Assert.NotEqual(first.SessionId, second.SessionId);
        Assert.Equal(first.Tracks.Select(t => t.PreviewUrl), second.Tracks.Select(t => t.PreviewUrl));
        // Le défi est généré par le secours à la volée, marqué comme tel, et une seule fois.
        Assert.Equal(1, await _game.App.ChallengeCountAsync());
        Assert.Equal((short)InSeconds.Api.Modules.Daily.Domain.ChallengeOrigin.OnTheFly, await _game.App.OriginOfAsync(Today));
    }

    [Fact]
    public async Task Demarrer_ReponseSansRienQuiDonneLaReponse_Piege31()
    {
        var alice = await _game.NewPlayerAsync();
        await _game.GenerateAsync();

        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET cover_hash = 'abcdef0123456789'");

        var response = await alice.StartRawAsync();
        var body = await response.Content.ReadAsStringAsync(Ct);

        // Ni artiste, ni titre, ni identifiant Deezer, ni année, ni pochette : tout cela donnerait la réponse (deezer.com/track/{id},
        // recherche d'image inversée sur la pochette).
        Assert.DoesNotContain("Artiste", body, StringComparison.Ordinal);
        Assert.DoesNotContain("Titre", body, StringComparison.Ordinal);
        Assert.DoesNotContain("deezer", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("abcdef0123456789", body, StringComparison.Ordinal);
        Assert.DoesNotContain("cover", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("releaseYear", body, StringComparison.OrdinalIgnoreCase);
        foreach (var position in Enumerable.Range(1, 5))
            Assert.DoesNotContain((1000 + await _game.TrackAtAsync(Today, position)).ToString(System.Globalization.CultureInfo.InvariantCulture), body, StringComparison.Ordinal);
        // Les seules propriétés d'un morceau : sa position et son extrait.
        var tracks = System.Text.Json.JsonDocument.Parse(body).RootElement.GetProperty("tracks");
        Assert.All(tracks.EnumerateArray(), t => Assert.Equal(["position", "previewUrl"], t.EnumerateObject().Select(p => p.Name)));
    }

    [Fact]
    public async Task Expiration_NeToucheJamaisUnePartieTerminee()
    {
        var alice = await _game.NewPlayerAsync();
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        var old = await _game.Api.ScalarAsync<int>("SELECT nextval('daily.sessions_hilo')::int");
        await _game.Api.ExecuteAsync(
            $"""
            INSERT INTO daily.sessions (id, player_id, challenge_id, status, started_at, ended_at, total_score, total_listened_seconds)
            SELECT {old}, '{alice.Id}', id, 1, now(), now(), 4250, 5 FROM daily.challenges
            """);
        await _game.GenerateAsync();

        await alice.StartAsync();

        // Terminée hier, elle le reste : l'expiration ne vise que les parties encore en cours.
        Assert.Equal((short)1, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {old}"));
    }

    [Fact]
    public async Task Demarrer_PoolInsuffisant_503NoChallenge_EtRienNEstEcrit()
    {
        await using var empty = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 3);
        var alice = await empty.NewPlayerAsync();

        var response = await alice.StartRawAsync();

        await GameAsserts.ProblemAsync(response, HttpStatusCode.ServiceUnavailable, "daily.no_challenge");
        Assert.Equal(0L, await empty.Api.ScalarAsync<long>("SELECT count(*) FROM daily.sessions"));
        Assert.Equal(0L, await empty.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenges"));
    }

    [Theory]
    [InlineData(9_000_000_001L)] // Deezer répond « pas d'extrait »
    [InlineData(7_000_000_001L)] // Deezer répond « quota dépassé » : l'état est inconnu, le joueur peut passer
    public async Task Demarrer_MorceauSansExtraitUtilisable_AdresseVide_LesAutresGardentLeur(long deezerId)
    {
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        await _game.Api.ExecuteAsync($"UPDATE catalogue.tracks SET deezer_track_id = {deezerId} WHERE id = 3");
        var alice = await _game.NewPlayerAsync();

        var started = await alice.StartAsync();

        Assert.Equal("", started.Tracks.Single(t => t.Position == 3).PreviewUrl);
        Assert.All(started.Tracks.Where(t => t.Position != 3), t => Assert.StartsWith("http", t.PreviewUrl));
    }

    [Fact]
    public async Task Demarrer_PartieEnCours_LaReprend_AvecSesReponses()
    {
        var alice = await _game.NewPlayerAsync();
        await _game.GenerateAsync();
        var started = await alice.StartAsync();
        var firstTrack = await _game.TrackAtAsync(Today, 1);
        var answer = await alice.AnswerCorrectlyAsync(started.SessionId, 1, 0.5m);

        var resumed = await alice.StartAsync();

        Assert.True(resumed.IsResuming);
        Assert.Equal(started.SessionId, resumed.SessionId);
        Assert.Equal(2, resumed.NextPosition);
        var done = Assert.Single(resumed.CompletedAnswers);
        // Le morceau répondu est révélé, les autres non.
        Assert.Equal((1, true, true, answer.Score, 0.5m), (done.Position, done.ArtistCorrect, done.TitleCorrect, done.Score, done.ListenedSeconds));
        Assert.Equal(($"Artiste {firstTrack}", $"Titre {firstTrack}", 1000L + firstTrack), (done.CorrectArtist, done.CorrectTitle, done.DeezerTrackId));
        Assert.Null(resumed.CurrentTrack);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.sessions"));
    }

    [Fact]
    public async Task Demarrer_Reprise_RenduLePlancherEtLesIndicesDuMorceauEnCours()
    {
        var alice = await _game.NewPlayerAsync();
        await _game.GenerateAsync();
        var started = await alice.StartAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await alice.ListenAsync(started.SessionId, 1, 10)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await alice.HintAsync(started.SessionId, 1, 2)).StatusCode);

        var resumed = await alice.StartAsync();

        var current = resumed.CurrentTrack!;
        Assert.Equal((1, 10m, 2), (current.Position, current.ListenedSeconds, current.HintLevel));
        // Ce que les indices ont déjà révélé : l'année (niveau 1, cumulé) et l'artiste masqué.
        Assert.Equal(["year", "artistMasked"], current.HintFacts.Select(f => f.Kind));
    }

    [Fact]
    public async Task Demarrer_DeuxFoisEnMemeTemps_UneSeulePartie()
    {
        var alice = await _game.NewPlayerAsync();
        await _game.GenerateAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => alice.StartRawAsync()));

        // Double clic, deux onglets : tous reçoivent la même partie, aucun n'échoue sur l'index unique.
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var ids = await Task.WhenAll(responses.Select(async r => (await r.Content.ReadFromJsonAsync<StartSessionResponse>(Ct))!.SessionId));
        Assert.Single(ids.Distinct());
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.sessions"));
    }

    [Fact]
    public async Task Demarrer_PartieTerminee_409AlreadyPlayed_PartieAbandonnee_409Abandoned()
    {
        var done = await _game.NewPlayerAsync();
        var gaveUp = await _game.NewPlayerAsync();
        await _game.GenerateAsync();
        await done.FinishAsync((await done.StartAsync()).SessionId);
        await gaveUp.AbandonAsync((await gaveUp.StartAsync()).SessionId);

        await GameAsserts.ProblemAsync(await done.StartRawAsync(), HttpStatusCode.Conflict, "daily.already_played");
        await GameAsserts.ProblemAsync(await gaveUp.StartRawAsync(), HttpStatusCode.Conflict, "daily.abandoned");
        Assert.Equal(2L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.sessions"));
    }

    [Fact]
    public async Task Expiration_UnePartieDHierRestee_EnCours_EstExpireeAuDemarrageDAujourdhui()
    {
        var alice = await _game.NewPlayerAsync();
        // Une partie commencée hier et jamais terminée : le joueur est parti sans abandonner.
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        var old = await _game.Api.ScalarAsync<int>("SELECT nextval('daily.sessions_hilo')::int");
        await _game.Api.ExecuteAsync(
            $"""
            INSERT INTO daily.sessions (id, player_id, challenge_id, status, started_at, total_score, total_listened_seconds)
            SELECT {old}, '{alice.Id}', id, 0, now(), 0, 0 FROM daily.challenges
            """);
        await _game.GenerateAsync();

        var started = await alice.StartAsync();

        Assert.NotEqual(old, started.SessionId);
        Assert.False(started.IsResuming);
        // Expirée (pas abandonnée : les statistiques de l'admin distinguent le bouton de la sortie sans terminer), avec sa date de fin.
        Assert.Equal((short)3, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {old}"));
        Assert.NotNull(await _game.Api.ScalarAsync<DateTime?>($"SELECT ended_at FROM daily.sessions WHERE id = {old}"));
        Assert.Equal((short)0, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {started.SessionId}"));
    }

    // --- GET /api/daily/today : lecture seule ---

    [Fact]
    public async Task Aujourdhui_SansDefi_NoChallenge_EtNeGenereRien_NiNeCreeAucunJoueur()
    {
        var today = await _game.Api.CreateClient().GetFromJsonAsync<TodayResponse>("/api/daily/today", Ct);

        Assert.Equal(("no_challenge", 0, 0), (today!.State, today.TracksCount, today.CompletedCount));
        Assert.Equal("active", today.Streak.Status);
        Assert.Equal(0L, await _game.App.ChallengeCountAsync());
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
    }

    [Fact]
    public async Task Aujourdhui_Visiteur_PeutJouer_AvecLeNombreDeMorceaux()
    {
        await _game.GenerateAsync();

        var today = await _game.Api.CreateClient().GetFromJsonAsync<TodayResponse>("/api/daily/today", Ct);

        Assert.Equal(("can_start", 5, 0), (today!.State, today.TracksCount, today.CompletedCount));
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.sessions"));
    }

    [Fact]
    public async Task Aujourdhui_SuitLaPartie_PeutJouer_EnCours_Terminee_Abandonnee()
    {
        var alice = await _game.NewPlayerAsync();
        var bob = await _game.NewPlayerAsync();
        await _game.GenerateAsync();
        Assert.Equal("can_start", (await alice.TodayAsync()).State);

        var aliceSession = (await alice.StartAsync()).SessionId;
        await alice.AnswerCorrectlyAsync(aliceSession, 1, 1);
        await alice.AnswerCorrectlyAsync(aliceSession, 2, 1);
        var inProgress = await alice.TodayAsync();
        Assert.Equal(("resumable", 2), (inProgress.State, inProgress.CompletedCount));

        await alice.FinishAsync(aliceSession, fromPosition: 3);
        var finished = await alice.TodayAsync();
        Assert.Equal(("already_played", 0), (finished.State, finished.CompletedCount));

        await bob.AbandonAsync((await bob.StartAsync()).SessionId);
        Assert.Equal("abandoned", (await bob.TodayAsync()).State);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
