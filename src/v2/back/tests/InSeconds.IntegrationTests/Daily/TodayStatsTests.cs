using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Les statistiques du jour (E3, § 5.6 du plan v2) : publiques, mais les morceaux ne se révèlent qu'à un joueur dont la partie est finie (piège 31).
/// Les joueurs supprimés n'y figurent pas.
/// </summary>
public class TodayStatsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static Task<TodayStatsResponse> StatsAsync(HttpClient client) =>
        client.GetFromJsonAsync<TodayStatsResponse>("/api/daily/stats/today", TestContext.Current.CancellationToken)!;

    [Fact]
    public async Task SansDefi_ToutAZero_200()
    {
        var stats = await StatsAsync(_game.Api.CreateClient());

        Assert.Equal(TodayStatsResponse.Empty.TotalPlayers, stats.TotalPlayers);
        Assert.Equal((null, 0, 0, 0, 0), (stats.YourScore, stats.MedianScore, stats.TotalPlayers, stats.MaxPossibleScore, stats.Tracks.Count));
        Assert.Empty(stats.ScoreDistribution);
        Assert.Equal(0L, await _game.App.ChallengeCountAsync());
    }

    [Fact]
    public async Task Anonyme_VoitLesChiffresDuJour_PasUnSeulMorceau()
    {
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync();
        var bob = await _game.NewPlayerAsync();
        await alice.FinishAsync((await alice.StartAsync()).SessionId, seconds: 1);
        await bob.FinishAsync((await bob.StartAsync()).SessionId, seconds: 2);

        var response = await _game.Api.CreateClient().GetAsync("/api/daily/stats/today", Ct);
        var body = await response.Content.ReadAsStringAsync(Ct);
        var stats = System.Text.Json.JsonSerializer.Deserialize<TodayStatsResponse>(body, DayStatsJson.Options)!;

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // 5 × 850 et 5 × 550 : deux joueurs, médiane entière de (2750 + 4250) / 2.
        Assert.Equal((2, 3500, 2750, 4250, 5000, null, null), (stats.TotalPlayers, stats.MedianScore, stats.MinScore, stats.MaxScore, stats.MaxPossibleScore, stats.YourScore, stats.BetterThanPercent));
        Assert.Equal(10, stats.ScoreDistribution.Count);
        Assert.Equal(2, stats.ScoreDistribution.Sum(b => b.Count));
        // Rien qui donne la réponse avant de jouer : ni liste de morceaux, ni nom, ni identifiant Deezer, ni pochette.
        Assert.Empty(stats.Tracks);
        Assert.DoesNotContain("Artiste", body, StringComparison.Ordinal);
        Assert.DoesNotContain("deezer", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("cover", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PartieEnCours_NeRevelePasLesMorceaux_MemePourSonProprietaire()
    {
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync();
        var session = (await alice.StartAsync()).SessionId;
        await alice.AnswerCorrectlyAsync(session, 1, 1);
        var finisher = await _game.NewPlayerAsync();
        await finisher.FinishAsync((await finisher.StartAsync()).SessionId);

        var stats = await StatsAsync(alice.Client);

        Assert.Empty(stats.Tracks);
        Assert.Null(stats.YourScore);
        Assert.Equal(1, stats.TotalPlayers);
    }

    [Fact]
    public async Task PartieTerminee_RevelelesMorceaux_AvecLesChiffresDesAutres_EtSaReponse()
    {
        await _game.GenerateAsync();
        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET cover_hash = 'abcdef0123456789'");
        var alice = await _game.NewPlayerAsync();
        var bob = await _game.NewPlayerAsync();
        var aliceSession = (await alice.StartAsync()).SessionId;
        var bobSession = (await bob.StartAsync()).SessionId;
        // Alice trouve tout à 1 s ; Bob trouve le premier à 2 s, rate le deuxième, et finit le reste à 1 s.
        await alice.FinishAsync(aliceSession, seconds: 1);
        var firstTrack = await _game.TrackAtAsync(Today, 1);
        await bob.AnswerAsync(bobSession, 1, 2, $"Artiste {firstTrack}", $"Titre {firstTrack}");
        await bob.AnswerAsync(bobSession, 2, 1, "Zzzz", "Yyyy");
        await bob.FinishAsync(bobSession, fromPosition: 3, seconds: 1);

        var stats = await StatsAsync(alice.Client);

        Assert.Equal((4250, 2), (stats.YourScore, stats.TotalPlayers));
        Assert.Equal([1, 2, 3, 4, 5], stats.Tracks.Select(t => t.Position));
        var first = stats.Tracks[0];
        Assert.Equal(($"Artiste {firstTrack}", $"Titre {firstTrack}", 1000L + firstTrack), (first.Artist, first.Title, first.DeezerTrackId));
        Assert.Contains("abcdef0123456789", first.CoverUrl, StringComparison.Ordinal);
        // Les autres : un à 1 s, un à 2 s, personne n'a raté ; moyenne 1,5 s.
        Assert.Equal((0d, 1.5, 0), (first.FailureRatePercent, first.AverageSecondsWhenCorrect, first.NotFoundCount));
        Assert.Equal([0, 1, 0, 1, 0, 0, 0], first.GuessTimeDistribution.Select(b => b.Count));
        // Sa propre réponse.
        Assert.Equal((true, true, 1m, 850), (first.ArtistCorrect, first.TitleCorrect, first.ListenedSeconds, first.Score));
        // Le deuxième morceau : un trouvé, un raté, 50 % d'échec.
        Assert.Equal((50d, 1), (stats.Tracks[1].FailureRatePercent, stats.Tracks[1].NotFoundCount));
    }

    [Fact]
    public async Task PartieAbandonnee_RevelelesMorceaux_SansScore()
    {
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync();
        var session = (await alice.StartAsync()).SessionId;
        await alice.AnswerCorrectlyAsync(session, 1, 1);
        await alice.AbandonAsync(session);

        var stats = await StatsAsync(alice.Client);

        Assert.Equal(5, stats.Tracks.Count);
        Assert.Null(stats.YourScore);
        // Elle n'a pas de réponse à elle à montrer : seules les parties terminées comptent et se montrent.
        Assert.All(stats.Tracks, t => Assert.Null(t.Score));
        Assert.Equal(0, stats.TotalPlayers);
    }

    [Fact]
    public async Task MeilleurQue_PartDesAutresJoueursBattus()
    {
        await _game.GenerateAsync();
        var players = new List<Gamer>();
        foreach (var seconds in new[] { 0.5m, 1m, 10m })
        {
            var gamer = await _game.NewPlayerAsync();
            await gamer.FinishAsync((await gamer.StartAsync()).SessionId, seconds: seconds);
            players.Add(gamer);
        }

        Assert.Equal(100, (await StatsAsync(players[0].Client)).BetterThanPercent);
        Assert.Equal(50, (await StatsAsync(players[1].Client)).BetterThanPercent);
        Assert.Equal(0, (await StatsAsync(players[2].Client)).BetterThanPercent);
    }

    [Fact]
    public async Task SeulSurLeDefi_PasDePourcentage()
    {
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync();
        await alice.FinishAsync((await alice.StartAsync()).SessionId);

        Assert.Null((await StatsAsync(alice.Client)).BetterThanPercent);
    }

    [Fact]
    public async Task UnJoueurSupprime_DisparaitDesStats_DeLaMedianeEtDeLaRepartition()
    {
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync();
        var gone = await _game.NewPlayerAsync();
        await alice.FinishAsync((await alice.StartAsync()).SessionId, seconds: 1);
        await gone.FinishAsync((await gone.StartAsync()).SessionId, seconds: 10);
        Assert.Equal(2, (await StatsAsync(alice.Client)).TotalPlayers);

        await _game.DeletePlayerAsync(gone.Id);

        var stats = await StatsAsync(alice.Client);
        Assert.Equal((1, 4250, 4250), (stats.TotalPlayers, stats.MinScore, stats.MaxScore));
        Assert.Equal(1, stats.ScoreDistribution.Sum(b => b.Count));
        Assert.Null(stats.BetterThanPercent);
        // Ni dans les chiffres de chaque morceau : le supprimé a trouvé à 10 s, plus personne n'y est à 10 s, et il ne reste qu'une réponse par morceau.
        Assert.All(stats.Tracks, t => Assert.Equal(0, t.GuessTimeDistribution.Single(b => b.DurationSeconds == 10m).Count));
        Assert.All(stats.Tracks, t => Assert.Equal(1m, t.GuessTimeDistribution.Where(b => b.DurationSeconds == 1m).Sum(b => (decimal)b.Count)));
        Assert.All(stats.Tracks, t => Assert.Equal(1, t.GuessTimeDistribution.Sum(b => b.Count)));
        // Ni dans ce que voient les autres joueurs à la révélation d'un morceau (statistiques de la réponse).
        var bob = await _game.NewPlayerAsync();
        var bobSession = (await bob.StartAsync()).SessionId;
        var answer = await bob.AnswerCorrectlyAsync(bobSession, 1, 2);
        // Alice (1 s) et Bob (2 s) : le supprimé (10 s) n'est pas dans la moyenne.
        Assert.Equal(1.5, answer.AverageSecondsWhenCorrect);
        Assert.Equal(0, answer.GuessTimeDistribution.Single(b => b.DurationSeconds == 10m).Count);
    }

    [Fact]
    public async Task UnMorceauRenomme_SeMontreAvecSonNouveauNom()
    {
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync();
        await alice.FinishAsync((await alice.StartAsync()).SessionId);
        var track = await _game.TrackAtAsync(Today, 1);
        await _game.App.Admin().PatchAsJsonAsync($"/api/admin/catalogue/tracks/{track}", new { artist = "Nouveau Nom", title = "Nouveau Titre (Radio Edit)" }, Ct);

        var first = (await StatsAsync(alice.Client)).Tracks[0];

        // Le nom est relu à chaque lecture ; le titre est celui qu'on montre, sans parenthèses.
        Assert.Equal(("Nouveau Nom", "Nouveau Titre"), (first.Artist, first.Title));
    }

    // --- série et gels ---

    [Fact]
    public async Task Serie_EffectiveDuJoueur_EtGelsDeLaPartieDuJour()
    {
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.SetStreakAsync(alice.Id, 5, Today.AddDays(-2), 1);
        await alice.FinishAsync((await alice.StartAsync()).SessionId);

        var stats = await StatsAsync(alice.Client);

        // Un jour manqué couvert par le gel : la série continue, le gel est consommé (toast « 1 gel a sauvé ta série »).
        Assert.Equal((6, 1, false), (stats.CurrentStreak, stats.FreezesUsed, stats.FreezeMilestone));
    }

    [Fact]
    public async Task Gel_GagnePourUnCompte_PalierAtteintPourUnInvite()
    {
        await _game.GenerateAsync();
        var linked = await _game.NewPlayerAsync("Alice");
        var guest = await _game.NewPlayerAsync();
        await _game.SetStreakAsync(linked.Id, 6, Today.AddDays(-1), 0);
        await _game.SetStreakAsync(guest.Id, 6, Today.AddDays(-1), 0);
        await linked.FinishAsync((await linked.StartAsync()).SessionId);
        await guest.FinishAsync((await guest.StartAsync()).SessionId);

        // « +1 gel gagné ! » pour le compte ; « Tu aurais gagné un gel ! » pour l'invité, qui n'a jamais de stock.
        Assert.True((await StatsAsync(linked.Client)).FreezeMilestone);
        Assert.True((await StatsAsync(guest.Client)).FreezeMilestone);
        Assert.Equal(0, await _game.Api.ScalarAsync<short>($"SELECT freezes FROM daily.streaks WHERE player_id = '{guest.Id}'"));
    }

    [Fact]
    public async Task Gel_PartieNonTerminee_AucunMessage()
    {
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.SetStreakAsync(alice.Id, 6, Today.AddDays(-1), 0);
        await alice.StartAsync();

        var stats = await StatsAsync(alice.Client);

        Assert.Equal((0, false, 6), (stats.FreezesUsed, stats.FreezeMilestone, stats.CurrentStreak));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
