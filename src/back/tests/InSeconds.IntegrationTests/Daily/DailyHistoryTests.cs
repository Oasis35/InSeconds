using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// L'historique du joueur sur le défi du jour (<c>GET /api/daily/history</c>, proto 4) : ses parties terminées, un mois à la fois, avec un résumé de
/// tout. Il ne lit que ses propres parties ; une partie abandonnée n'y est pas.
/// </summary>
public class DailyHistoryTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly Sept = new(2026, 9, 20);
    private static readonly DateOnly Oct = Today.AddDays(-2);

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static readonly (decimal, bool, bool, bool, int)[] Perfect = [.. Enumerable.Repeat((1m, true, true, false, 850), 5)];

    private static readonly (decimal, bool, bool, bool, int)[] Partial =
        [(1m, true, true, false, 850), (2m, true, false, false, 300), (2m, false, false, false, 0), (3m, true, true, false, 700), (5m, true, true, false, 400)];

    private async Task<DailyHistoryResponse> HistoryAsync(Gamer gamer, string? month = null) =>
        (await gamer.Client.GetFromJsonAsync<DailyHistoryResponse>(month is null ? "/api/daily/history" : $"/api/daily/history?month={month}", Ct))!;

    private async Task SeedAsync(Gamer gamer)
    {
        await _game.App.AddChallengeAsync(Sept, 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Oct, 6, 7, 8, 9, 10);
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 11, 12, 13, 14, 15);
        await _game.AddSessionAsync(gamer.Id, Sept, 1, Perfect);
        await _game.AddSessionAsync(gamer.Id, Oct, 1, Partial);
        // Abandonnée : sans score, elle n'est pas dans l'historique.
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-1), 2, Perfect[0]);
    }

    [Fact]
    public async Task LeMoisEnCours_ParDefaut_LeResumeCompteTout()
    {
        var gamer = await _game.NewPlayerAsync();
        await SeedAsync(gamer);

        var history = await HistoryAsync(gamer);

        Assert.Equal(("2026-10", "2026-09", (string?)null), (history.Month, history.PreviousMonth, history.NextMonth));
        Assert.Equal(2, history.PlayedCount);
        Assert.Equal(4250, history.BestScore);
        // (4250 + 2250) / 2
        Assert.Equal(3250, history.AverageScore);
        var game = Assert.Single(history.Games);
        Assert.Equal((Oct, 2250), (game.Date, game.Score));
        Assert.Equal([1, 2, 3, 4, 5], game.Tracks.Select(t => t.Position));
        Assert.Equal([(true, true), (true, false), (false, false), (true, true), (true, true)], game.Tracks.Select(t => (t.ArtistCorrect, t.TitleCorrect)));
    }

    [Fact]
    public async Task UnMoisPasse_ADesFlechesVersLesMoisJoues()
    {
        var gamer = await _game.NewPlayerAsync();
        await SeedAsync(gamer);

        var history = await HistoryAsync(gamer, "2026-09");

        Assert.Equal(("2026-09", (string?)null, "2026-10"), (history.Month, history.PreviousMonth, history.NextMonth));
        Assert.Equal(Sept, Assert.Single(history.Games).Date);
        // Le résumé ne suit pas le mois affiché.
        Assert.Equal(2, history.PlayedCount);
    }

    [Fact]
    public async Task UnMoisVide_RienDansLaListe_MaisLesFlechesSavent()
    {
        var gamer = await _game.NewPlayerAsync();
        await SeedAsync(gamer);

        var history = await HistoryAsync(gamer, "2026-07");

        Assert.Empty(history.Games);
        Assert.Equal((null, "2026-09"), (history.PreviousMonth, history.NextMonth));
    }

    [Fact]
    public async Task JoueurSansPartie_ListeVide_ResumeVide()
    {
        var gamer = await _game.NewPlayerAsync();

        var history = await HistoryAsync(gamer);

        Assert.Equal((0, null, null), (history.PlayedCount, history.AverageScore, history.BestScore));
        Assert.Empty(history.Games);
        Assert.Equal((null, null), (history.PreviousMonth, history.NextMonth));
    }

    [Fact]
    public async Task UnJoueur_NeLitQueSesParties()
    {
        var gamer = await _game.NewPlayerAsync();
        await SeedAsync(gamer);
        var other = await _game.NewPlayerAsync("Autre");
        await _game.AddSessionAsync(other.Id, Oct, 1, Perfect);

        var mine = await HistoryAsync(gamer);
        var theirs = await HistoryAsync(other);

        Assert.Equal(2250, Assert.Single(mine.Games).Score);
        Assert.Equal(4250, Assert.Single(theirs.Games).Score);
        Assert.Equal(1, theirs.PlayedCount);
        var body = await gamer.Client.GetStringAsync("/api/daily/history", Ct);
        Assert.DoesNotContain(other.Id.ToString(), body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task MoisMalEcrit_400_PasDIdentite_401()
    {
        var gamer = await _game.NewPlayerAsync();

        foreach (var month in new[] { "2026-13", "octobre", "2026-1", "2026-10-01" })
            await GameAsserts.ProblemAsync(await gamer.Client.GetAsync($"/api/daily/history?month={month}", Ct), HttpStatusCode.BadRequest, DailyErrorCodes.InvalidMonth);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync("/api/daily/history", Ct)).StatusCode);
    }
}
