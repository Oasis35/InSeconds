using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// L'historique du joueur sur le défi du jour (<c>GET /api/daily/history</c>) : le calendrier du mois (l'état de chaque jour de défi jusqu'à
/// aujourd'hui) et ses chiffres. Il ne lit que ses propres parties ; sans identité, les jours de défi, tous « pas joués ».
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
        // Abandonnée après une réponse : pas de score, « pas fini ».
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-1), 2, Perfect[0]);
    }

    [Fact]
    public async Task LeCalendrier_DonneLEtatDeChaqueJourJusquAAujourdhui()
    {
        var gamer = await _game.NewPlayerAsync();
        await SeedAsync(gamer);
        await _game.App.AddChallengeAsync(new DateOnly(2026, 10, 1), 16, 17, 18, 19, 20);
        await _game.App.AddChallengeAsync(Today, 21, 22, 23, 24, 25);

        var history = await HistoryAsync(gamer);

        Assert.Equal(("2026-10", "2026-09", (string?)null), (history.Month, history.PreviousMonth, history.NextMonth));
        Assert.Equal(
            [(new DateOnly(2026, 10, 1), "missed", (int?)null), (Oct, "played", 2250), (Today.AddDays(-1), "unfinished", null), (Today, "today", null)],
            history.Days.Select(d => (d.Date, d.State, d.Score)));
        Assert.All(history.Days, d => Assert.Equal(history.Days[0].MaxPossibleScore, d.MaxPossibleScore));
        Assert.True(history.Days[0].MaxPossibleScore >= 4250);
    }

    [Fact]
    public async Task Piege18_LaVeilleEncoreEnCours_SeReprend_PasDeReponses()
    {
        var gamer = await _game.NewPlayerAsync();
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 11, 12, 13, 14, 15);
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-1), 0, Perfect[0]);

        var history = await HistoryAsync(gamer);

        Assert.Equal("resumable", Assert.Single(history.Days).State);
    }

    [Fact]
    public async Task LesChiffresDuMois_NeComptentQueLeMois_EtAujourdhuiSeulementTermine()
    {
        var gamer = await _game.NewPlayerAsync();
        await SeedAsync(gamer);
        await _game.App.AddChallengeAsync(Today, 21, 22, 23, 24, 25);

        // Octobre : le 3 (terminé) et le 4 (pas fini) comptent ; aujourd'hui, pas encore terminé, non.
        var october = await HistoryAsync(gamer);
        Assert.Equal((1, 2, (int?)2250, (int?)2250), (october.MonthPlayedCount, october.MonthPublishedCount, october.MonthAverageScore, october.MonthBestScore));

        await _game.AddSessionAsync(gamer.Id, Today, 1, Perfect);
        var done = await HistoryAsync(gamer);
        Assert.Equal((2, 3, (int?)3250, (int?)4250), (done.MonthPlayedCount, done.MonthPublishedCount, done.MonthAverageScore, done.MonthBestScore));
        Assert.Equal(("played", (int?)4250), (done.Days[^1].State, done.Days[^1].Score));

        var september = await HistoryAsync(gamer, "2026-09");
        Assert.Equal((1, 1, (int?)4250, (int?)4250), (september.MonthPlayedCount, september.MonthPublishedCount, september.MonthAverageScore, september.MonthBestScore));
        Assert.Equal(((string?)null, "2026-10"), (september.PreviousMonth, september.NextMonth));
    }

    [Fact]
    public async Task UnMoisVide_RienDansLeCalendrier_LesFlechesVontAuxMoisVoisins()
    {
        var gamer = await _game.NewPlayerAsync();
        await SeedAsync(gamer);

        var history = await HistoryAsync(gamer, "2026-07");

        Assert.Empty(history.Days);
        // Rien avant le premier défi (septembre) ; le mois d'après existe tant qu'il n'est pas dans le futur.
        Assert.Equal(((string?)null, "2026-08"), (history.PreviousMonth, history.NextMonth));
    }

    [Fact]
    public async Task UnAbandonSansReponse_EstUnJourPasJoue()
    {
        var gamer = await _game.NewPlayerAsync();
        await _game.App.AddChallengeAsync(Oct, 6, 7, 8, 9, 10);
        await _game.AddSessionAsync(gamer.Id, Oct, 2);

        var history = await HistoryAsync(gamer);

        Assert.Equal("missed", Assert.Single(history.Days).State);
        Assert.Equal((0, 1), (history.MonthPlayedCount, history.MonthPublishedCount));
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

        Assert.Equal(2250, mine.Days.Single(d => d.Date == Oct).Score);
        Assert.Equal(4250, theirs.Days.Single(d => d.Date == Oct).Score);
        Assert.Equal("missed", theirs.Days.Single(d => d.Date == Today.AddDays(-1)).State);
        var body = await gamer.Client.GetStringAsync("/api/daily/history", Ct);
        Assert.DoesNotContain(other.Id.ToString(), body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task MoisMalEcrit_400_SansIdentite_LeCalendrierSansRienCreer()
    {
        var gamer = await _game.NewPlayerAsync();
        await SeedAsync(gamer);

        foreach (var month in new[] { "2026-13", "octobre", "2026-1", "2026-10-01" })
            await GameAsserts.ProblemAsync(await gamer.Client.GetAsync($"/api/daily/history?month={month}", Ct), HttpStatusCode.BadRequest, DailyErrorCodes.InvalidMonth);

        // Un nouveau venu : les jours de défi, tous « pas joués », et aucun joueur créé.
        var players = await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.players");
        var anonymous = (await _game.Api.CreateClient().GetFromJsonAsync<DailyHistoryResponse>("/api/daily/history", Ct))!;
        Assert.Equal([(Oct, "missed"), (Today.AddDays(-1), "missed")], anonymous.Days.Select(d => (d.Date, d.State)));
        Assert.Equal((0, 2), (anonymous.MonthPlayedCount, anonymous.MonthPublishedCount));
        Assert.Equal(players, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
    }
}
