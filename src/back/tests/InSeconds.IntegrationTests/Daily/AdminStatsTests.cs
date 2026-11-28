using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>L'onglet Stats de l'admin : parties par jour, réponses, arrivées par source et par appareil, retour à J+1 et J+7.</summary>
public class AdminStatsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/admin/daily/stats";

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<StatsResponse> ReadAsync(string query = "")
    {
        var response = await _game.App.Admin().GetAsync(Route + query, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<StatsResponse>(Ct))!;
    }

    private async Task<Gamer> NewArrivalAsync(DateOnly created, string? source, string? device)
    {
        var player = await _game.NewPlayerAsync();
        await _game.Api.ExecuteAsync(
            $"UPDATE players.players SET acquisition_source = {(source is null ? "NULL" : $"'{source}'")}, device_class = {(device is null ? "NULL" : $"'{device}'")}, "
            + $"created_at = '{created:yyyy-MM-dd} 12:00:00+00' WHERE id = '{player.Id}'");
        return player;
    }

    [Theory]
    [InlineData("?days=0")]
    [InlineData("?days=15")]
    [InlineData("?days=365")]
    public async Task PeriodeInconnue_400(string query)
    {
        var response = await _game.App.Admin().GetAsync(Route + query, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("admin.invalid_period", await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task SansParametre_TrenteJours()
    {
        Assert.Equal(30, (await ReadAsync()).Days);
        Assert.Equal(7, (await ReadAsync("?days=7")).Days);
    }

    [Fact]
    public async Task SansAdmin_Refuse()
    {
        var player = await _game.NewPlayerAsync("Alice");

        var response = await player.Client.GetAsync(Route, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PartiesParJour_ParStatut_EtNouveauxContreHabitues()
    {
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        var carol = await _game.NewPlayerAsync("Carol");
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-1), 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(bob.Id, Today.AddDays(-1), 2, (1m, true, false, false, 425));
        await _game.AddSessionAsync(alice.Id, Today, 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(carol.Id, Today, 3, (1m, false, false, false, 0));

        var stats = await ReadAsync();

        Assert.Equal([Today.AddDays(-1), Today], stats.Daily.Select(d => d.Date));
        var yesterday = stats.Daily[0];
        Assert.Equal((1, 1, 0, 2, 2), (yesterday.Completed, yesterday.Abandoned, yesterday.Expired, yesterday.Players, yesterday.FirstTimePlayers));
        var today = stats.Daily[1];
        // Alice est une habituée ; Carol, qui n'a jamais joué avant, est nouvelle.
        Assert.Equal((1, 0, 1, 2, 1), (today.Completed, today.Abandoned, today.Expired, today.Players, today.FirstTimePlayers));
        Assert.Equal(850, stats.MedianScore);
    }

    [Fact]
    public async Task Reponses_TrouveEtPalierEcoute()
    {
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.AddSessionAsync(alice.Id, Today, 1, (0.5m, true, true, false, 1000), (1m, true, false, false, 450), (1m, false, false, false, 0));

        var answers = (await ReadAsync()).Answers;

        Assert.Equal((3, 2, 1), (answers.Total, answers.ArtistFound, answers.TitleFound));
        Assert.Equal([(0.5m, 1), (1m, 2)], answers.ByListened.Select(x => (x.Seconds, x.Count)));
    }

    [Fact]
    public async Task Retour_ParSource_EtParAppareil_DepuisLesParties()
    {
        var day = Today.AddDays(-3);
        await _game.App.AddChallengeAsync(day, 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(day.AddDays(1), 1, 2, 3, 4, 5);
        var returned = await NewArrivalAsync(day, "share", "phone");
        var gone = await NewArrivalAsync(day, "share", "desktop");
        var noSource = await NewArrivalAsync(day, null, null);
        foreach (var player in new[] { returned, gone, noSource })
            await _game.AddSessionAsync(player.Id, day, 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(returned.Id, day.AddDays(1), 1, (1m, true, true, false, 850));

        var stats = await ReadAsync();

        Assert.Equal(new StatsCohortResponse("all", 3, 3, 1, 0, 0), stats.Overall);
        // Le joueur sans source n'a pas de groupe de source, ni d'appareil.
        Assert.Equal([new StatsCohortResponse("share", 2, 2, 1, 0, 0)], stats.Sources);
        Assert.Equal(
            [new StatsCohortResponse("desktop", 1, 1, 0, 0, 0), new StatsCohortResponse("phone", 1, 1, 1, 0, 0)],
            stats.Devices.OrderBy(d => d.Key).ToList());
    }

    [Fact]
    public async Task JoueurEfface_NeFigurePlusNullePart()
    {
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        var alice = await NewArrivalAsync(Today, "share", "phone");
        await _game.AddSessionAsync(alice.Id, Today, 1, (1m, true, true, false, 850));

        await _game.ErasePlayerAsync(alice.Id);
        var stats = await ReadAsync();

        Assert.Empty(stats.Daily);
        Assert.Equal(0, stats.Overall.New);
        Assert.Empty(stats.Sources);
    }
}
