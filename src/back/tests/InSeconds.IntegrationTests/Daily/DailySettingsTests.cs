using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using Microsoft.Extensions.Options;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Les réglages publics du défi du jour, relus à chaud, et le contrôle de leur cohérence au démarrage.
/// </summary>
public class DailySettingsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task ParDefaut_LesValeursDeLaV1_SansAucuneLigneEnBase()
    {
        // La seconde tentative est coupée par défaut dans ces tests (GameApi) : le réglage est donc donné, sa valeur par défaut (70) est vue par DailyScoringAndRulesTests.
        await using var game = await GameApi.CreateAsync(
            _connectionString, tracks: 0, settings: new Dictionary<string, string> { ["Daily:RetryScorePercent"] = "70" });

        var settings = await ReadAsync(game);

        Assert.Equal(70, settings.RetryScorePercent);
        Assert.Equal((20, 5, 7, 2), (settings.GuessTimerSeconds, settings.TracksPerChallenge, settings.StreakFreezeEveryDays, settings.StreakFreezeMax));
        Assert.Equal([0.5m, 1m, 1.5m, 2m, 3m, 5m, 10m], settings.AllowedDurationsSeconds);
        Assert.Equal(
            [(0.5m, 1000), (1m, 850), (1.5m, 700), (2m, 550), (3m, 400), (5m, 250), (10m, 100)],
            settings.DurationScores.Select(d => (d.Seconds, d.Score)));
    }

    [Fact]
    public async Task Public_SansCookie()
    {
        await using var game = await GameApi.CreateAsync(_connectionString, tracks: 0);

        var response = await game.Api.CreateClient().GetAsync("/api/daily/settings", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ReluAChaud_ListesRemplacentLesValeursParDefaut_SansLesAppendre()
    {
        await using var game = await GameApi.CreateAsync(_connectionString, tracks: 0);
        await game.SetSettingAsync("Daily:AllowedDurationsSeconds", "[1,2]");
        await game.SetSettingAsync("Daily:DurationScores", """[{"seconds":1,"score":500},{"seconds":2,"score":200}]""");
        await game.SetSettingAsync("Daily:GuessTimerSeconds", "30");

        var settings = await ReadAsync(game);

        Assert.Equal([1m, 2m], settings.AllowedDurationsSeconds);
        Assert.Equal([(1m, 500), (2m, 200)], settings.DurationScores.Select(d => (d.Seconds, d.Score)));
        Assert.Equal(30, settings.GuessTimerSeconds);
    }

    [Fact]
    public async Task ReluAChaud_LeBaremeEtLesPaliersChangesSAppliquentAUneReponse()
    {
        await using var game = await GameApi.CreateAsync(_connectionString);
        var alice = await game.NewPlayerAsync();
        await game.GenerateAsync();
        var session = (await alice.StartAsync()).SessionId;
        await game.SetSettingAsync("Daily:AllowedDurationsSeconds", "[1,2]");
        await game.SetSettingAsync("Daily:DurationScores", """[{"seconds":1,"score":500},{"seconds":2,"score":200}]""");

        // 0,5 s n'est plus un palier ; 1 s vaut maintenant 500.
        Assert.Equal(HttpStatusCode.BadRequest, (await alice.ListenAsync(session, 1, 0.5m)).StatusCode);
        Assert.Equal(500, (await alice.AnswerCorrectlyAsync(session, 1, 1)).Score);
    }

    // --- le contrôle au démarrage ---

    [Fact]
    public async Task Demarrage_ReglageIncoherent_RefuseDeDemarrer()
    {
        await using var api = new ApiFactory(_connectionString, settings: new Dictionary<string, string>
        {
            ["Daily:RetryScorePercent"] = "150",
        });

        var exception = Assert.ThrowsAny<Exception>(() => api.Server);

        var validation = Assert.Single(Unwrap(exception).OfType<OptionsValidationException>());
        Assert.Contains("Daily:RetryScorePercent", validation.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Demarrage_ReglagesParDefaut_Demarre()
    {
        await using var api = new ApiFactory(_connectionString);

        Assert.NotNull(api.Server);
    }

    private static async Task<DailySettingsResponse> ReadAsync(GameApi game) =>
        (await game.Api.CreateClient().GetFromJsonAsync<DailySettingsResponse>("/api/daily/settings", Ct))!;

    private static IEnumerable<Exception> Unwrap(Exception exception)
    {
        for (Exception? e = exception; e is not null; e = e.InnerException)
        {
            yield return e;
            if (e is AggregateException aggregate)
                foreach (var inner in aggregate.InnerExceptions.SelectMany(Unwrap))
                    yield return inner;
        }
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
