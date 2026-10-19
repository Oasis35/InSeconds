using System.Diagnostics.Metrics;
using InSeconds.Api.Modules.Daily.Application;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;
using Wolverine;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Les compteurs OpenTelemetry du défi du jour (<see cref="DailyMetrics"/>), lus par le tableau Grafana « Activité » : une partie jouée par HTTP
/// doit les faire avancer, avec des étiquettes stables (le tableau filtre dessus) et sans identifiant de joueur ni de morceau.
/// </summary>
public class DailyMetricsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());
        await _game.GenerateAsync();
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private MetricCollector<T> Collect<T>(string instrument) where T : struct =>
        new(_game.Api.Services.GetRequiredService<IMeterFactory>(), DailyMetrics.MeterName, instrument);

    private static string? Tag<T>(CollectedMeasurement<T> measurement, string key) where T : struct =>
        measurement.Tags.TryGetValue(key, out var value) ? Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) : null;

    [Fact]
    public async Task PartieJouee_CompteDemarrage_Indice_Reponses_Fin_EtLeScore()
    {
        using var sessions = Collect<long>(DailyMetrics.SessionsName);
        using var answers = Collect<long>(DailyMetrics.AnswersName);
        using var hints = Collect<long>(DailyMetrics.HintsName);
        using var scores = Collect<int>(DailyMetrics.SessionScoreName);
        var alice = await _game.NewPlayerAsync();

        var session = (await alice.StartAsync()).SessionId;
        await alice.ListenAsync(session, 1, 5);
        (await alice.HintAsync(session, 1, 1)).EnsureSuccessStatusCode();
        var trackId = await _game.TrackAtAsync(Today, 1);
        (await alice.AnswerAsync(session, 1, 5, $"Artiste {trackId}", "Zzzz")).EnsureSuccessStatusCode();
        var last = await alice.FinishAsync(session, fromPosition: 2, seconds: 0.5m);

        Assert.Equal([DailyMetrics.Started, DailyMetrics.Completed], sessions.GetMeasurementSnapshot().Select(m => Tag(m, "event")));
        Assert.Equal(["1"], hints.GetMeasurementSnapshot().Select(m => Tag(m, "hint_level")));
        var all = answers.GetMeasurementSnapshot();
        Assert.Equal(5, all.Count);
        var first = all[0];
        Assert.Equal(("5", "1", "True", "False"),
            (Tag(first, "listened_seconds"), Tag(first, "hint_level"), Tag(first, "artist_found"), Tag(first, "title_found")));
        Assert.All(all.Skip(1), m => Assert.Equal(("0.5", "0", "True", "True"),
            (Tag(m, "listened_seconds"), Tag(m, "hint_level"), Tag(m, "artist_found"), Tag(m, "title_found"))));
        // Jamais d'identifiant : un joueur ou un morceau en étiquette ferait exploser le nombre de séries.
        Assert.All(all, m => Assert.Equal(["artist_found", "hint_level", "listened_seconds", "title_found"], m.Tags.Keys.Order()));
        Assert.True(last.Completed);
        var total = await _game.Api.ScalarAsync<int>($"SELECT total_score FROM daily.sessions WHERE id = {session}");
        Assert.Equal([total], scores.GetMeasurementSnapshot().Select(m => m.Value));
    }

    [Fact]
    public async Task Reprise_NeCompteRien_Abandon_EstCompte()
    {
        using var sessions = Collect<long>(DailyMetrics.SessionsName);
        var bob = await _game.NewPlayerAsync();

        var session = (await bob.StartAsync()).SessionId;
        await bob.StartAsync();
        (await bob.AbandonAsync(session)).EnsureSuccessStatusCode();

        Assert.Equal([DailyMetrics.Started, DailyMetrics.Abandoned], sessions.GetMeasurementSnapshot().Select(m => Tag(m, "event")));
    }

    [Fact]
    public async Task Expiration_DeLaNuit_CompteLesParties()
    {
        var old = Today.AddDays(-3);
        await _game.App.AddChallengeAsync(old, 1, 2, 3, 4, 5);
        await _game.AddSessionAsync((await _game.NewPlayerAsync()).Id, old, 0);
        await _game.AddSessionAsync((await _game.NewPlayerAsync()).Id, old, 0);
        using var sessions = Collect<long>(DailyMetrics.SessionsName);

        await _game.Api.Services.GetRequiredService<IMessageBus>().InvokeAsync<int>(new ExpireStaleSessions(), TestContext.Current.CancellationToken);
        // Une seconde passe n'a plus rien à expirer : rien n'est compté.
        await _game.Api.Services.GetRequiredService<IMessageBus>().InvokeAsync<int>(new ExpireStaleSessions(), TestContext.Current.CancellationToken);

        var expired = Assert.Single(sessions.GetMeasurementSnapshot());
        Assert.Equal((2L, DailyMetrics.Expired), (expired.Value, Tag(expired, "event")));
    }
}
