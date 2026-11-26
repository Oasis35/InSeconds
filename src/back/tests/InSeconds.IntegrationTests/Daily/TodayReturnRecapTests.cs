using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// De quoi accueillir un habitué, rendu par <c>GET /api/daily/today</c> : seulement pour un compte qui a terminé au moins 14 parties, avec son score
/// d'hier, sa moyenne et, sur les sept jours jusqu'à hier, ses parties et ses morceaux trouvés au premier palier. Que ses propres parties.
/// </summary>
public class TodayReturnRecapTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 90);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    /// <summary>Des défis des <paramref name="days"/> derniers jours (hier compris) et le défi du jour.</summary>
    private async Task ChallengesAsync(int days)
    {
        for (var i = 1; i <= days; i++)
        {
            var first = i * 5 - 4;
            await _game.App.AddChallengeAsync(Today.AddDays(-i), first, first + 1, first + 2, first + 3, first + 4);
        }

        await _game.App.AddChallengeAsync(Today, 81, 82, 83, 84, 85);
    }

    [Fact]
    public async Task Habitue_ScoreDHier_Moyenne_EtMorceauxTrouvesAuPremierPalierDeLaSemaine()
    {
        await ChallengesAsync(14);
        var alice = await _game.NewPlayerAsync("Alice");
        // 14 parties terminées à 1 000 ; hier : 2 000, dont deux morceaux trouvés au premier palier (0,5 s) et un à 2 s.
        for (var i = 2; i <= 14; i++)
            await _game.AddSessionAsync(alice.Id, Today.AddDays(-i), status: 1, (1m, true, true, false, 1000));
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-1), status: 1, (0.5m, true, true, false, 900), (0.5m, true, true, false, 900), (2m, true, true, false, 200));

        var recap = (await alice.TodayAsync()).Recap;

        Assert.NotNull(recap);
        Assert.Equal(2000, recap.YesterdayScore);
        Assert.Equal(1071, recap.AverageScore);
        Assert.Equal(7, recap.WeekGames);
        Assert.Equal(2, recap.WeekFirstStepFound);
    }

    [Fact]
    public async Task SousQuatorzeParties_OuPourUnInvite_PasDeRecap()
    {
        await ChallengesAsync(14);
        var alice = await _game.NewPlayerAsync("Alice");
        var guest = await _game.NewPlayerAsync();
        for (var i = 1; i <= 13; i++)
            await _game.AddSessionAsync(alice.Id, Today.AddDays(-i), status: 1, (1m, true, true, false, 1000));
        for (var i = 1; i <= 14; i++)
            await _game.AddSessionAsync(guest.Id, Today.AddDays(-i), status: 1, (1m, true, true, false, 1000));

        Assert.Null((await alice.TodayAsync()).Recap);
        Assert.Null((await guest.TodayAsync()).Recap);
    }
}
