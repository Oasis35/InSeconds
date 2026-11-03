using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le nombre de parties terminées d'un joueur, tous jours confondus, rendu par <c>GET /api/daily/today</c> (panneau de la série).
/// </summary>
public class GamesPlayedTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    [Fact]
    public async Task Aujourdhui_PartiesTermineesDuJoueur_DeTousLesJours_InviteCompris()
    {
        var twoDaysAgo = Today.AddDays(-2);
        await _game.GenerateAsync(Today.AddDays(-3));
        await _game.GenerateAsync(twoDaysAgo);
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        var guest = await _game.NewPlayerAsync();

        // Alice : terminée il y a trois jours, abandonnée il y a deux jours, celle du jour terminée. Bob et l'invité : celle du jour.
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-3), status: 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(alice.Id, twoDaysAgo, status: 2);
        Assert.Equal(1, (await alice.TodayAsync()).CompletedGames);
        await alice.FinishAsync((await alice.StartAsync()).SessionId);
        await bob.FinishAsync((await bob.StartAsync()).SessionId);
        await guest.FinishAsync((await guest.StartAsync()).SessionId);

        Assert.Equal(2, (await alice.TodayAsync()).CompletedGames);
        Assert.Equal(1, (await bob.TodayAsync()).CompletedGames);
        Assert.Equal(1, (await guest.TodayAsync()).CompletedGames);
    }
}
