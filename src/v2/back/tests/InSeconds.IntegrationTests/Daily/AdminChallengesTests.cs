using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// « Stats par défi » et l'historique des défis de l'admin (F1, v1 : <c>GET /api/admin/challenge-stats</c> et <c>GET /api/admin/challenges</c>) :
/// la photo figée pour J-2 et avant, le calcul en direct pour la veille et le jour même, le pseudo et le titre toujours joints à la lecture.
/// </summary>
public class AdminChallengesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string StatsRoute = "/api/admin/daily/challenges/stats";
    private const string ListRoute = "/api/admin/daily/challenges";

    // Aujourd'hui : 5 octobre ; l'avant-veille (dernier jour qu'on peut figer) : le 3.
    private static readonly DateOnly Closable = Today.AddDays(-2);

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<IReadOnlyList<AdminChallengeStats>> StatsAsync()
    {
        var response = await _game.App.Admin().GetAsync(StatsRoute, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AdminChallengeStatsResponse>(Ct))!.Challenges;
    }

    private async Task<(Guid Alice, Guid Bob, Guid Carol)> SeedDayAsync(DateOnly day)
    {
        await _game.App.AddChallengeAsync(day, 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        var carol = await _game.NewPlayerAsync();
        // Alice trouve tout à 1 s (4250 points), Bob rate le premier morceau et trouve le reste à 2 s avec une prolongation, Carol est restée en cours.
        await _game.AddSessionAsync(alice.Id, day, 1, Enumerable.Repeat((1m, true, true, false, 850), 5).ToArray());
        await _game.AddSessionAsync(bob.Id, day, 1,
            [(1m, false, false, false, 0), (2m, true, true, true, 550), (2m, true, true, true, 550), (2m, true, true, true, 550), (2m, true, true, true, 550)]);
        await _game.AddSessionAsync(carol.Id, day, 0, (1m, true, true, false, 850));
        return (alice.Id, bob.Id, carol.Id);
    }

    private Task<HttpResponseMessage> RecomputeAsync(DateOnly day) =>
        _game.App.Admin().PostAsync($"/api/admin/daily/challenges/{day:yyyy-MM-dd}/stats/recompute", null, Ct);

    // --- les stats par défi ---

    [Fact]
    public async Task LeJourMeme_EstCalculeEnDirect_SansPhoto_NonRecalculable()
    {
        var (alice, bob, carol) = await SeedDayAsync(Today);

        var today = Assert.Single(await StatsAsync());

        Assert.Equal(Today, today.Date);
        Assert.Null(today.ComputedAt);
        Assert.False(today.CanRecompute);
        // Le jour même, la partie de Carol est vraiment en cours.
        Assert.Equal((2, 1, 0, 0), (today.PlayerCount, today.PendingCount, today.AbandonedCount, today.ExpiredCount));
        Assert.Equal((2200, 4250, 3225.0, 3225.0), (today.ScoreMin, today.ScoreMax, today.ScoreAvg, today.ScoreMedian));
        Assert.Equal(
            [(alice, "Completed", 4250, "Alice"), (bob, "Completed", 2200, "Bob"), (carol, "Pending", 850, (string?)null)],
            today.Players.Select(p => (p.PlayerId, p.Status, p.Score, p.Pseudo)));
    }

    [Fact]
    public async Task Morceaux_LeNomDeLArtisteEtLeTitreAffiche_EtLesChiffresDeLaPosition()
    {
        await SeedDayAsync(Today);
        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET title = 'Titre 1 (Radio Edit)' WHERE id = 1");

        var first = (await StatsAsync()).Single().Tracks[0];

        Assert.Equal((1, "Artiste 1", "Titre 1"), (first.Position, first.Artist, first.Title));
        // Trois réponses (Alice, Bob qui rate, Carol), l'artiste trouvé deux fois sur trois.
        Assert.Equal((3, 66.7, 66.7, 0.0, 1), (first.TotalAnswers, first.ArtistCorrectRate, first.TitleCorrectRate, first.ExtendedRate, first.NotFoundCount));
        Assert.Equal(2, first.GuessTimeDistribution.Single(b => b.Seconds == 1m).Count);
    }

    [Fact]
    public async Task UnJourFige_EstLuDansSaPhoto_UnePartieAjouteeApresNeLaChangePas()
    {
        await SeedDayAsync(Closable);
        Assert.Equal(HttpStatusCode.OK, (await RecomputeAsync(Closable)).StatusCode);
        var late = await _game.NewPlayerAsync("Late");
        await _game.AddSessionAsync(late.Id, Closable, 1, (1m, true, true, false, 850));

        var frozen = (await StatsAsync()).Single();

        Assert.Equal(2, frozen.PlayerCount);
        Assert.Equal(3, frozen.Players.Count);
        Assert.Equal(_game.Time.GetUtcNow(), frozen.ComputedAt);
        Assert.True(frozen.CanRecompute);

        // Le recalcul refait la photo : la partie ajoutée apparaît.
        await RecomputeAsync(Closable);
        Assert.Equal(3, (await StatsAsync()).Single().PlayerCount);
    }

    [Fact]
    public async Task UnJourTermineSansPhoto_EstCalculeEnDirect_MaisRecalculable()
    {
        await SeedDayAsync(Closable);

        var day = (await StatsAsync()).Single();

        Assert.Null(day.ComputedAt);
        Assert.True(day.CanRecompute);
        // Un jour révolu n'a plus de partie « en cours » : celle de Carol est expirée.
        Assert.Equal((2, 0, 1), (day.PlayerCount, day.PendingCount, day.ExpiredCount));
        Assert.Equal("Expired", day.Players.Single(p => p.Pseudo is null).Status);
    }

    [Fact]
    public async Task LaVeille_EstCalculeeEnDirect_NonRecalculable_PiegeDixHuit()
    {
        await SeedDayAsync(Today.AddDays(-1));

        var yesterday = (await StatsAsync()).Single();

        Assert.False(yesterday.CanRecompute);
        Assert.Null(yesterday.ComputedAt);
    }

    [Fact]
    public async Task LeTitreEtLePseudo_NeSontPasFiges_UnRenommageSeVoitSansRecalcul()
    {
        var (_, bob, _) = await SeedDayAsync(Closable);
        await RecomputeAsync(Closable);

        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET artist = 'Daft Punk', title = 'One More Time (Radio Edit)' WHERE id = 1");
        await _game.Api.ExecuteAsync($"UPDATE players.accounts SET pseudo = 'Robert' WHERE player_id = '{bob}'");

        var day = (await StatsAsync()).Single();

        Assert.Equal(("Daft Punk", "One More Time"), (day.Tracks[0].Artist, day.Tracks[0].Title));
        Assert.Equal("Robert", day.Players.Single(p => p.PlayerId == bob).Pseudo);
    }

    [Fact]
    public async Task UnJoueurSupprimeApresLaPhoto_RestePorteMaisSonPseudoNEstPlusMontre()
    {
        var (alice, _, _) = await SeedDayAsync(Closable);
        await RecomputeAsync(Closable);

        await _game.DeletePlayerAsync(alice);

        var day = (await StatsAsync()).Single();

        // Limite connue de E3 : la photo le garde jusqu'au prochain recalcul, mais son pseudo ne s'affiche plus.
        Assert.Equal(2, day.PlayerCount);
        Assert.Null(day.Players.Single(p => p.PlayerId == alice).Pseudo);

        await RecomputeAsync(Closable);
        Assert.DoesNotContain((await StatsAsync()).Single().Players, p => p.PlayerId == alice);
    }

    [Fact]
    public async Task LesTrenteDerniersDefis_DuPlusRecentAuPlusAncien()
    {
        for (var i = 0; i < 32; i++)
            await _game.App.AddChallengeAsync(Today.AddDays(-i), 1, 2, 3, 4, 5);

        var challenges = await StatsAsync();

        Assert.Equal(30, challenges.Count);
        Assert.Equal(Today, challenges[0].Date);
        Assert.Equal(Today.AddDays(-29), challenges[^1].Date);
    }

    [Fact]
    public async Task SansDefi_ListeVide_200()
    {
        Assert.Empty(await StatsAsync());
    }

    [Fact]
    public async Task Statistiques_ReserveesAUnAdmin_401Et403()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync(StatsRoute, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).GetAsync(StatsRoute, Ct)).StatusCode);
    }

    // --- l'historique des défis ---

    [Fact]
    public async Task Historique_DuPlusRecentAuPlusAncien_AvecLesMorceauxDansLOrdre()
    {
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 5, 4, 3, 2, 1);
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET title = 'Titre 2 (Live)' WHERE id = 2");

        var response = await _game.App.Admin().GetAsync(ListRoute, Ct);
        var challenges = (await response.Content.ReadFromJsonAsync<List<AdminChallenge>>(Ct))!;

        Assert.Equal([Today, Today.AddDays(-1)], challenges.Select(c => c.Date));
        Assert.Equal([(1, "Artiste 1", "Titre 1", 1001L), (2, "Artiste 2", "Titre 2", 1002L)], challenges[0].Tracks.Take(2).Select(t => (t.Position, t.Artist, t.Title, t.DeezerTrackId)));
        // Le défi d'hier : les morceaux 5 à 1 aux positions 1 à 5.
        Assert.Equal([1005L, 1004L, 1003L, 1002L, 1001L], challenges[1].Tracks.Select(t => t.DeezerTrackId));
        Assert.Equal([1, 2, 3, 4, 5], challenges[1].Tracks.Select(t => t.Position));
        // Le titre est celui qu'on affiche, sans parenthèses.
        Assert.Equal("Titre 2", challenges[0].Tracks[1].Title);
    }

    [Fact]
    public async Task Historique_SansDefi_ListeVide()
    {
        var response = await _game.App.Admin().GetAsync(ListRoute, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.Content.ReadFromJsonAsync<List<AdminChallenge>>(Ct))!);
    }

    [Fact]
    public async Task Historique_ReserveAUnAdmin_401Et403()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync(ListRoute, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).GetAsync(ListRoute, Ct)).StatusCode);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
