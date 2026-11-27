using InSeconds.Api.Infrastructure.Hosting;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// La commande <c>--freeze-day-stats</c> (historique chargé sans ses photos) : la même photo que la tâche
/// <c>daily-close-day</c>, sans démarrer l'API. Elle lit l'horloge du système : les jours posés ici sont loin dans le passé.
/// </summary>
public class FreezeDayStatsCommandTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly OldDay = new(2026, 9, 20);

    private string _connectionString = null!;
    private GameApi _game = null!;

    public async ValueTask InitializeAsync()
    {
        _connectionString = await postgres.CreateDatabaseAsync();
        _game = await GameApi.CreateAsync(_connectionString);
        await _game.App.AddChallengeAsync(OldDay, 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.AddSessionAsync(alice.Id, OldDay, 1, Enumerable.Repeat((1m, true, true, false, 850), 5).ToArray());
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private Task<int> RunAsync() =>
        FreezeDayStatsCommand.RunAsync(
            [FreezeDayStatsCommand.Flag, $"--ConnectionStrings:DefaultConnection={_connectionString}"], Ct);

    private Task<long> FrozenAsync() => _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_day_stats");

    [Fact]
    public async Task JourTermineSansPhoto_EstFige_PuisLaCommandeSeRejoueSansEffet()
    {
        Assert.Equal(0L, await FrozenAsync());

        Assert.Equal(0, await RunAsync());
        Assert.Equal(1L, await FrozenAsync());
        var photo = await _game.Api.ScalarAsync<string>("SELECT payload::text FROM daily.challenge_day_stats");

        // Un jour déjà figé n'est pas refait.
        Assert.Equal(0, await RunAsync());
        Assert.Equal(1L, await FrozenAsync());
        Assert.Equal(photo, await _game.Api.ScalarAsync<string>("SELECT payload::text FROM daily.challenge_day_stats"));
    }

    [Fact]
    public async Task ReglagesIncoherents_CodeDeSortie1_AucunJourFige()
    {
        await _game.Api.ExecuteAsync(
            "INSERT INTO infra.settings (key, value, updated_at) VALUES ('Daily:RetryScorePercent', '150', now())");

        Assert.Equal(1, await RunAsync());
        Assert.Equal(0L, await FrozenAsync());
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
