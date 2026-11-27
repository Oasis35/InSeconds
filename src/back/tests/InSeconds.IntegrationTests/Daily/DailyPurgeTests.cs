using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Daily.Persistence;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// <c>--purge-daily-before</c> (<see cref="DailyPurge"/>) : les jours d'avant la date limite partent avec leurs parties, réponses, photos de
/// stats et morceaux de défi ; la date limite est conservée ; les séries sont rejouées depuis les jours restants.
/// </summary>
public class DailyPurgeTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly Cutoff = new(2026, 9, 15);
    private static readonly StreakRules Rules = new(FreezeEveryDays: 7, FreezeMax: 2, LostNudgeMinDays: 2);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<DailyPurgeReport> PurgeAsync(bool apply)
    {
        await using var scope = _game.Api.Services.CreateAsyncScope();
        var purge = new DailyPurge(scope.ServiceProvider.GetRequiredService<InSecondsDbContext>(), scope.ServiceProvider.GetRequiredService<IPlayerDirectory>());
        return await purge.RunAsync(Cutoff, Rules, apply, Ct);
    }

    private async Task<(Guid Alice, Guid Bob, Guid Carol)> SeedAsync()
    {
        foreach (var day in new[] { 13, 14, 15, 16 })
            await _game.App.AddChallengeAsync(new DateOnly(2026, 9, day), 1, 2, 3, 4, 5);
        await _game.Api.ExecuteAsync(
            """
            INSERT INTO daily.challenge_day_stats (challenge_id, computed_at, version, payload)
            SELECT id, now(), 1, '{}'::jsonb FROM daily.challenges WHERE date IN ('2026-09-13', '2026-09-15')
            """);

        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync();
        var carol = await _game.NewPlayerAsync();
        var answer = new (decimal, bool, bool, bool, int)[] { (1m, true, true, false, 850) };
        foreach (var day in new[] { 14, 15, 16 })
            await _game.AddSessionAsync(alice.Id, new DateOnly(2026, 9, day), 1, answer);
        await _game.AddSessionAsync(bob.Id, new DateOnly(2026, 9, 13), 1, answer);
        await _game.AddSessionAsync(carol.Id, new DateOnly(2026, 9, 14), 2, answer);
        await _game.AddSessionAsync(carol.Id, new DateOnly(2026, 9, 16), 1, answer);

        await _game.SetStreakAsync(alice.Id, 3, new DateOnly(2026, 9, 16), 1);
        await _game.SetStreakAsync(bob.Id, 1, new DateOnly(2026, 9, 13), 0);
        await _game.SetStreakAsync(carol.Id, 5, new DateOnly(2026, 9, 16), 0);
        return (alice.Id, bob.Id, carol.Id);
    }

    private Task<long> CountAsync(string table) => _game.Api.ScalarAsync<long>($"SELECT count(*) FROM {table}");

    [Fact]
    public async Task Simulation_CompteSansRienSupprimer()
    {
        await SeedAsync();

        var report = await PurgeAsync(apply: false);

        Assert.False(report.Applied);
        Assert.Equal((2, 10, 1, 3, 3, 3), (report.Challenges, report.ChallengeTracks, report.DayStats, report.Sessions, report.Answers, report.Players));
        Assert.Equal((0, 2, 1), (report.StreaksKept, report.StreaksChanged, report.StreaksRemoved));
        Assert.Equal(4, await CountAsync("daily.challenges"));
        Assert.Equal(6, await CountAsync("daily.sessions"));
        Assert.Equal(6, await CountAsync("daily.answers"));
        Assert.Equal(2, await CountAsync("daily.challenge_day_stats"));
        Assert.Equal(3, await CountAsync("daily.streaks"));
        // Les trois séries sont inchangées en base : Alice 3, Bob 1, Carol 5.
        Assert.Equal("1,3,5", await _game.Api.ScalarAsync<string>("SELECT string_agg(current_streak::text, ',' ORDER BY current_streak) FROM daily.streaks"));
    }

    [Fact]
    public async Task Application_EffaceLesJoursAvantLaLimite_ConserveLeJourLimite()
    {
        var (alice, bob, carol) = await SeedAsync();

        var report = await PurgeAsync(apply: true);

        Assert.True(report.Applied);
        // Restent le 15 et le 16, avec leurs parties (alice 2, carol 1) et leurs réponses ; la photo du 15 reste, celle du 13 part.
        Assert.Equal(2, await CountAsync("daily.challenges"));
        Assert.Equal(10, await CountAsync("daily.challenge_tracks"));
        Assert.Equal(3, await CountAsync("daily.sessions"));
        Assert.Equal(3, await CountAsync("daily.answers"));
        Assert.Equal(1, await CountAsync("daily.challenge_day_stats"));
        Assert.Equal(1, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenges WHERE date = '2026-09-15'"));
        Assert.Equal(0, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenges WHERE date < '2026-09-15'"));
        // Les joueurs ne sont pas touchés.
        Assert.Equal(3, await CountAsync("players.players"));
        Assert.Equal(0, await CountAsync($"daily.streaks WHERE player_id = '{bob}'"));

        // Alice (compte, gel offert) : 15 et 16 → série 2, un gel gardé. Carol (invitée) : seul le 16 reste → série 1.
        Assert.Equal((2, 2, 1), (
            await _game.Api.ScalarAsync<int>($"SELECT current_streak FROM daily.streaks WHERE player_id = '{alice}'"),
            await _game.Api.ScalarAsync<int>($"SELECT best_streak FROM daily.streaks WHERE player_id = '{alice}'"),
            (int)await _game.Api.ScalarAsync<short>($"SELECT freezes FROM daily.streaks WHERE player_id = '{alice}'")));
        Assert.Equal((1, 1), (
            await _game.Api.ScalarAsync<int>($"SELECT current_streak FROM daily.streaks WHERE player_id = '{carol}'"),
            await _game.Api.ScalarAsync<int>($"SELECT best_streak FROM daily.streaks WHERE player_id = '{carol}'")));
    }

    [Fact]
    public async Task Rejouable_UneSecondePurgeNeChangeRien()
    {
        await SeedAsync();
        await PurgeAsync(apply: true);

        var again = await PurgeAsync(apply: true);

        Assert.Equal((0, 0, 0, 0, 0, 0), (again.Challenges, again.ChallengeTracks, again.DayStats, again.Sessions, again.Answers, again.Players));
        Assert.Equal((2, 0, 0), (again.StreaksKept, again.StreaksChanged, again.StreaksRemoved));
    }

    [Fact]
    public async Task JoursConserves_PartiesNonTermineesIgnorees_SansLigneDeSerieAucuneCreee_SurvieIntacte()
    {
        await _game.App.AddChallengeAsync(new DateOnly(2026, 9, 16), 1, 2, 3, 4, 5);
        var dave = await _game.NewPlayerAsync();
        var eve = await _game.NewPlayerAsync("Eve");
        var answer = new (decimal, bool, bool, bool, int)[] { (1m, true, true, false, 850) };
        // Dave : partie abandonnée sur un jour conservé, et une série d'avant ; Eve : partie terminée mais aucune ligne de série.
        await _game.AddSessionAsync(dave.Id, new DateOnly(2026, 9, 16), 2, answer);
        await _game.SetStreakAsync(dave.Id, 4, new DateOnly(2026, 9, 16), 0);
        await _game.AddSessionAsync(eve.Id, new DateOnly(2026, 9, 16), 1, answer);
        await _game.Api.ExecuteAsync($"INSERT INTO runs.access (player_id, granted_at) VALUES ('{eve.Id}', now())");

        var report = await PurgeAsync(apply: true);

        Assert.Equal((0, 0, 0, 0, 0, 1), (report.Challenges, report.Sessions, report.Answers, report.StreaksKept, report.StreaksChanged, report.StreaksRemoved));
        // Dave n'a aucune partie terminée restante : sa série part. Eve n'en reçoit pas.
        Assert.Equal(0, await CountAsync("daily.streaks"));
        Assert.Equal(2, await CountAsync("daily.sessions"));
        Assert.Equal(5, await CountAsync("daily.challenge_tracks"));
        Assert.Equal(1, await CountAsync("runs.access"));
    }
}
