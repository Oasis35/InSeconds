using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// La photo figée d'un jour terminé pour de bon (E3, § 5.4 du plan v2) : J-2 et avant. La tâche <c>daily-close-day</c> et le recalcul de l'admin
/// écrivent la même photo, une partie de la veille pouvant encore se finir après minuit (piège 18).
/// </summary>
public class DayStatsSnapshotTests(PostgresFixture postgres) : IAsyncLifetime
{
    // Aujourd'hui : 5 octobre ; l'avant-veille (dernier jour qu'on peut figer) : le 3.
    private static readonly DateOnly Closable = Today.AddDays(-2);

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<(Guid Alice, Guid Bob, Guid Carol)> SeedClosedDayAsync(DateOnly day)
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

    private async Task<RecomputeDayStatsResponse> RecomputeAsync(DateOnly day)
    {
        var response = await _game.App.Admin().PostAsync($"/api/admin/daily/challenges/{day:yyyy-MM-dd}/stats/recompute", null, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RecomputeDayStatsResponse>(Ct))!;
    }

    // --- le recalcul de l'admin ---

    [Fact]
    public async Task Recalcul_FigeLeJour_ScoresCompteursEtMorceaux()
    {
        var (alice, bob, carol) = await SeedClosedDayAsync(Closable);

        var result = await RecomputeAsync(Closable);

        var stats = result.Stats;
        Assert.Equal(Closable, result.Date);
        // Deux parties terminées, une partie « en cours » d'un jour passé : jamais revenue, donc expirée.
        Assert.Equal((2, 0, 0, 1), (stats.PlayerCount, stats.PendingCount, stats.AbandonedCount, stats.ExpiredCount));
        Assert.Equal((2200, 4250), (stats.ScoreMin, stats.ScoreMax));
        Assert.Equal((3225.0, 3225.0), (stats.ScoreAvg, stats.ScoreMedian));
        Assert.Equal(5000, stats.MaxPossibleScore);
        Assert.Equal(2, stats.ScoreDistribution.Sum(b => b.Count));
        Assert.Equal(
            [(alice, "Completed", 4250), (bob, "Completed", 2200), (carol, "Expired", 850)],
            stats.Players.Select(p => (p.PlayerId, p.Status, p.Score)));
        // Le premier morceau : 3 réponses (Alice, Bob qui rate, Carol), l'artiste trouvé 2 fois sur 3.
        var first = stats.Tracks[0];
        Assert.Equal((1, 3, 66.7, 66.7, 0.0), (first.Position, first.TotalAnswers, first.ArtistCorrectRate, first.TitleCorrectRate, first.ExtendedRate));
        Assert.Equal(1, first.NotFoundCount);
        // Alice et Carol ont trouvé à 1 s, Bob a raté.
        Assert.Equal(2, first.GuessTimeDistribution.Single(b => b.Seconds == 1m).Count);
        // Bob a prolongé l'écoute sur les quatre autres.
        Assert.Equal(50.0, stats.Tracks[1].ExtendedRate);
    }

    [Fact]
    public async Task Recalcul_EnregistreLaPhoto_VersionDateEtContenu()
    {
        await SeedClosedDayAsync(Closable);
        var challenge = await _game.ChallengeIdAsync(Closable);

        await RecomputeAsync(Closable);

        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.challenge_day_stats WHERE challenge_id = {challenge}"));
        Assert.Equal((short)1, await _game.Api.ScalarAsync<short>($"SELECT version FROM daily.challenge_day_stats WHERE challenge_id = {challenge}"));
        var json = await _game.Api.ScalarAsync<string>($"SELECT payload::text FROM daily.challenge_day_stats WHERE challenge_id = {challenge}");
        var stored = DayStatsJson.Read(json!)!;
        Assert.Equal((Closable, 2), (stored.Date, stored.PlayerCount));
        Assert.Equal(_game.Time.GetUtcNow(), new DateTimeOffset(await _game.Api.ScalarAsync<DateTime>($"SELECT computed_at FROM daily.challenge_day_stats WHERE challenge_id = {challenge}"), TimeSpan.Zero));
    }

    [Fact]
    public async Task Recalcul_RemplaceLaPhoto_SansEnCreerUneSeconde_EtGardeLesNouveauxPaliers()
    {
        await SeedClosedDayAsync(Closable);
        await RecomputeAsync(Closable);
        await _game.SetSettingAsync("Daily:AllowedDurationsSeconds", "[1,2]");
        await _game.SetSettingAsync("Daily:DurationScores", """[{"seconds":1,"score":500},{"seconds":2,"score":200}]""");
        _game.Time.Advance(TimeSpan.FromHours(1));

        var second = await RecomputeAsync(Closable);

        // Les paliers et le barème de la photo sont ceux en vigueur au calcul : une photo déjà figée n'est pas réécrite par un réglage, seulement par un recalcul.
        Assert.Equal([1m, 2m], second.Stats.AllowedDurationsSeconds);
        Assert.Equal([new DurationScore(1, 500), new DurationScore(2, 200)], second.Stats.DurationScores);
        Assert.Equal(2500, second.Stats.MaxPossibleScore);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
        Assert.Equal(_game.Time.GetUtcNow(), second.ComputedAt);
    }

    [Fact]
    public async Task Photo_GardeLesPaliersDuJourMemeSiUnReglageChangeApres()
    {
        await SeedClosedDayAsync(Closable);
        await RecomputeAsync(Closable);
        await _game.SetSettingAsync("Daily:AllowedDurationsSeconds", "[1,2]");

        var stored = DayStatsJson.Read((await _game.Api.ScalarAsync<string>("SELECT payload::text FROM daily.challenge_day_stats"))!)!;

        Assert.Equal(7, stored.AllowedDurationsSeconds.Count);
        Assert.Equal(DailyOptions.DefaultDurationScores, stored.DurationScores);
    }

    [Fact]
    public async Task Photo_ExclutLesJoueursSupprimes()
    {
        var (alice, bob, _) = await SeedClosedDayAsync(Closable);
        await _game.DeletePlayerAsync(bob);

        var stats = (await RecomputeAsync(Closable)).Stats;

        Assert.Equal(1, stats.PlayerCount);
        Assert.DoesNotContain(stats.Players, p => p.PlayerId == bob);
        Assert.Contains(stats.Players, p => p.PlayerId == alice);
        Assert.Equal(2, stats.Tracks[0].TotalAnswers);
        Assert.Equal((4250, 4250), (stats.ScoreMin, stats.ScoreMax));
    }

    [Fact]
    public async Task Recalcul_LaVeilleEtLeJourMeme_409DayNotOver_RienNEstEcrit()
    {
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today, 6, 7, 8, 9, 10);

        // Une partie de la veille peut encore se finir après minuit (piège 18) : on ne la fige pas.
        await GameAsserts.ProblemAsync(
            await _game.App.Admin().PostAsync($"/api/admin/daily/challenges/{Today.AddDays(-1):yyyy-MM-dd}/stats/recompute", null, Ct),
            HttpStatusCode.Conflict, "daily.day_not_over");
        await GameAsserts.ProblemAsync(
            await _game.App.Admin().PostAsync($"/api/admin/daily/challenges/{Today:yyyy-MM-dd}/stats/recompute", null, Ct),
            HttpStatusCode.Conflict, "daily.day_not_over");
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
    }

    [Fact]
    public async Task Recalcul_DateInvalideOuSansDefi_400Et404()
    {
        var admin = _game.App.Admin();

        await GameAsserts.ProblemAsync(await admin.PostAsync("/api/admin/daily/challenges/hier/stats/recompute", null, Ct), HttpStatusCode.BadRequest, "admin.invalid_date");
        await GameAsserts.ProblemAsync(await admin.PostAsync("/api/admin/daily/challenges/2026-9-1/stats/recompute", null, Ct), HttpStatusCode.BadRequest, "admin.invalid_date");
        await GameAsserts.ProblemAsync(await admin.PostAsync("/api/admin/daily/challenges/2026-01-01/stats/recompute", null, Ct), HttpStatusCode.NotFound, "common.not_found");
    }

    [Fact]
    public async Task Recalcul_ReserveAUnAdmin_401Et403()
    {
        await SeedClosedDayAsync(Closable);
        var route = $"/api/admin/daily/challenges/{Closable:yyyy-MM-dd}/stats/recompute";

        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().PostAsync(route, null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).PostAsync(route, null, Ct)).StatusCode);
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
    }

    [Fact]
    public async Task Recalcul_DeuxFoisEnMemeTemps_UneSeulePhoto_AucuneErreur()
    {
        await SeedClosedDayAsync(Closable);

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ =>
            _game.App.Admin().PostAsync($"/api/admin/daily/challenges/{Closable:yyyy-MM-dd}/stats/recompute", null, Ct)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
    }

    // --- la tâche daily-close-day ---

    private async Task<IReadOnlyDictionary<string, object?>> RunJobAsync()
    {
        using var scope = _game.Api.Services.CreateScope();
        var job = new DailyCloseDayJob(
            scope.ServiceProvider.GetRequiredService<IMessageBus>(),
            scope.ServiceProvider.GetRequiredService<InSeconds.Api.Infrastructure.Time.IGameCalendar>(),
            scope.ServiceProvider.GetRequiredService<IDailyStatsQueries>());
        return (IReadOnlyDictionary<string, object?>)(await job.RunAsync(Ct))!;
    }

    [Fact]
    public async Task Tache_FigeL_AvantVeille_PasLaVeilleNiLeJourMeme()
    {
        await SeedClosedDayAsync(Closable);
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 6, 7, 8, 9, 10);
        await _game.App.AddChallengeAsync(Today, 11, 12, 13, 14, 15);

        var report = await RunJobAsync();

        Assert.Equal(1, report["closed"]);
        Assert.Equal([$"{Closable:yyyy-MM-dd}"], (IEnumerable<string>)report["days"]!);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
    }

    [Fact]
    public async Task Tache_RattrapeLesJoursPlusAnciensRestesSansPhoto_DuPlusAncienAuPlusRecent()
    {
        foreach (var offset in new[] { -3, -4, -6 })
            await _game.App.AddChallengeAsync(Today.AddDays(offset), 1, 2, 3, 4, 5);
        // Un jour déjà figé n'est pas refait par la tâche.
        await RunJobAsync();
        _game.Time.Advance(TimeSpan.FromHours(2));
        await _game.App.AddChallengeAsync(Today.AddDays(-8), 1, 2, 3, 4, 5);

        var report = await RunJobAsync();

        Assert.Equal(1, report["closed"]);
        Assert.Equal(4L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
        // Les trois premières photos gardent leur date : seule la nouvelle est postérieure.
        Assert.Equal(3L, await _game.Api.ScalarAsync<long>(
            "SELECT count(*) FROM daily.challenge_day_stats WHERE computed_at < (SELECT max(computed_at) FROM daily.challenge_day_stats)"));
    }

    [Fact]
    public async Task Tache_RejoueeLeMemeJour_NeRefaitRien()
    {
        await SeedClosedDayAsync(Closable);
        await RunJobAsync();

        var second = await RunJobAsync();

        Assert.Equal(0, second["closed"]);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
    }

    [Fact]
    public async Task Tache_SansDefi_RienAFiger()
    {
        var report = await RunJobAsync();

        Assert.Equal(0, report["closed"]);
    }

    [Fact]
    public async Task Tache_EtRecalculAuMemeInstant_UneSeulePhoto()
    {
        await SeedClosedDayAsync(Closable);

        var recompute = _game.App.Admin().PostAsync($"/api/admin/daily/challenges/{Closable:yyyy-MM-dd}/stats/recompute", null, Ct);
        var job = RunJobAsync();
        await Task.WhenAll(recompute, job);

        Assert.Equal(HttpStatusCode.OK, (await recompute).StatusCode);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
    }

    [Fact]
    public async Task Photo_SupprimeeAvecLeDefi_PasDOrpheline()
    {
        await SeedClosedDayAsync(Closable);
        await RecomputeAsync(Closable);
        var challenge = await _game.ChallengeIdAsync(Closable);

        await _game.Api.ExecuteAsync($"DELETE FROM daily.answers; DELETE FROM daily.sessions; DELETE FROM daily.challenges WHERE id = {challenge}");

        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats"));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
