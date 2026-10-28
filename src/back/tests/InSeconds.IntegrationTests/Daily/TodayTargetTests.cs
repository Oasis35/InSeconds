using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le chiffre de l'accueil, rendu par <c>GET /api/daily/today</c> : le record du joueur (meilleure partie terminée, invité compris), sinon la
/// médiane d'hier à partir de 5 parties terminées. Jamais le meilleur score des autres.
/// </summary>
public class TodayTargetTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static readonly DateOnly Yesterday = Today.AddDays(-1);

    private async Task<TodayResponse> VisitorTodayAsync() =>
        (await _game.Api.CreateClient().GetFromJsonAsync<TodayResponse>("/api/daily/today", Ct))!;

    /// <summary>Des parties terminées hier, une par score, par des joueurs neufs.</summary>
    private async Task FinishYesterdayAsync(params int[] scores)
    {
        foreach (var score in scores)
            await _game.AddSessionAsync((await _game.NewPlayerAsync()).Id, Yesterday, status: 1, (1m, true, true, false, score));
    }

    [Fact]
    public async Task Visiteur_MedianeDHier_APartirDeCinqPartiesTerminees()
    {
        await _game.GenerateAsync(Yesterday);
        await _game.GenerateAsync();
        await FinishYesterdayAsync(400, 850, 1000, 1700, 2000, 2550);
        // Une partie abandonnée hier ne compte pas.
        await _game.AddSessionAsync((await _game.NewPlayerAsync()).Id, Yesterday, status: 2, (1m, true, true, false, 5000));

        var today = await VisitorTodayAsync();

        // Médiane de six scores : (1000 + 1700) / 2, arrondie vers le bas comme sur la page des réponses d'hier.
        Assert.Equal(1350, today.YesterdayMedian);
        Assert.Null(today.BestScore);
    }

    [Fact]
    public async Task SousCinqPartiesHier_NiMedianeNiRecord()
    {
        await _game.GenerateAsync(Yesterday);
        await _game.GenerateAsync();
        await FinishYesterdayAsync(400, 850, 1000, 1700);

        var today = await VisitorTodayAsync();

        Assert.Null(today.YesterdayMedian);
        Assert.Null(today.BestScore);
    }

    [Fact]
    public async Task SansDefiHier_PasDeMediane()
    {
        await _game.GenerateAsync();

        Assert.Null((await VisitorTodayAsync()).YesterdayMedian);
    }

    [Fact]
    public async Task Joueur_SonRecord_SurSesPartiesTerminees_InviteCompris_SansMediane()
    {
        var twoDaysAgo = Today.AddDays(-2);
        await _game.GenerateAsync(twoDaysAgo);
        await _game.GenerateAsync(Yesterday);
        await _game.GenerateAsync();
        await FinishYesterdayAsync(400, 850, 1000, 1700, 2000);
        var guest = await _game.NewPlayerAsync();
        var alice = await _game.NewPlayerAsync("Alice");

        // L'invité : 1 700 il y a deux jours, une partie abandonnée plus haute hier qui ne compte pas.
        await _game.AddSessionAsync(guest.Id, twoDaysAgo, status: 1, (1m, true, true, false, 1000), (1m, true, true, false, 700));
        await _game.AddSessionAsync(guest.Id, Yesterday, status: 2, (1m, true, true, false, 3000));
        // Alice : seulement une partie abandonnée, pas encore de record.
        await _game.AddSessionAsync(alice.Id, Yesterday, status: 2, (1m, true, true, false, 850));

        var guestToday = await guest.TodayAsync();
        Assert.Equal(1700, guestToday.BestScore);
        Assert.Null(guestToday.YesterdayMedian);

        var aliceToday = await alice.TodayAsync();
        Assert.Null(aliceToday.BestScore);
        Assert.Equal(1000, aliceToday.YesterdayMedian);
    }
}
