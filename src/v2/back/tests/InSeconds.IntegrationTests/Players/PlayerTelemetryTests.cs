using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Testing.Auth;
using InSeconds.IntegrationTests.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Identité du joueur dans la télémétrie (B5, § 5.7 du plan v2) : tag <c>inseconds.player_id</c> sur la
/// trace de la requête et scope de journal <c>PlayerId</c>, jamais d'email ni de pseudo.
/// </summary>
public class PlayerTelemetryTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Email = "telemetrie@example.com";
    private const string Pseudo = "Pseudo-Secret";

    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task JoueurConnecte_LaTraceEtLeJournalPortentSonIdentifiant_SansEmailNiPseudo()
    {
        var activities = new ConcurrentQueue<Activity>();
        var logs = new ScopeCapturingLoggerProvider();
        using var listener = Listen(activities);
        await using var host = new TestingFactory(_connectionString).WithWebHostBuilder(builder =>
            builder.ConfigureServices(services => services.AddSingleton<ILoggerProvider>(logs)));
        var client = host.CreateClient();
        await client.PostAsJsonAsync(DevLoginEndpoints.Route, new DevLoginRequest(Email, null), Ct);
        await client.PostAsJsonAsync(DevLoginEndpoints.Route, new DevLoginRequest(Email, Pseudo), Ct);
        var me = (await client.GetFromJsonAsync<PlayerMeResponse>("/api/players/me", Ct))!;
        Assert.Equal(Pseudo, me.Pseudo);

        var request = await WaitForRequestAsync(activities, "/api/players/me", me.PlayerId.ToString());

        Assert.Equal(me.PlayerId.ToString(), request.GetTagItem("inseconds.player_id"));
        // Ni l'adresse ni le pseudo, dans aucune trace ni aucun journal ou scope.
        foreach (var tag in activities.SelectMany(a => a.TagObjects))
        {
            var value = tag.Value?.ToString() ?? "";
            Assert.DoesNotContain(Email, value, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(Pseudo, value, StringComparison.OrdinalIgnoreCase);
        }
        Assert.Contains(logs.Entries, e => e.Scopes.Contains($"PlayerId={me.PlayerId}", StringComparison.Ordinal));
        foreach (var (message, scopes) in logs.Entries)
        {
            Assert.DoesNotContain(Email, message + scopes, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(Pseudo, message + scopes, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task JoueurNonIdentifie_AucunTagNiScopePlayerId()
    {
        var activities = new ConcurrentQueue<Activity>();
        var logs = new ScopeCapturingLoggerProvider();
        using var listener = Listen(activities);
        await using var host = new TestingFactory(_connectionString).WithWebHostBuilder(builder =>
            builder.ConfigureServices(services => services.AddSingleton<ILoggerProvider>(logs)));
        var client = host.CreateClient();

        // Chemin unique : l'écouteur de traces est global au processus, les autres tests (en parallèle) l'alimentent aussi.
        var path = $"/api/players/inconnu-{Guid.NewGuid():N}";
        var response = await client.GetAsync(path, Ct);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var request = await WaitForRequestAsync(activities, path, expectedPlayerId: null);
        Assert.Null(request.GetTagItem("inseconds.player_id"));
        Assert.NotEmpty(logs.Entries);
        Assert.DoesNotContain(logs.Entries, e => e.Scopes.Contains("PlayerId", StringComparison.Ordinal));
    }

    private static ActivityListener Listen(ConcurrentQueue<Activity> activities)
    {
        var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Microsoft.AspNetCore",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activities.Enqueue,
        };
        ActivitySource.AddActivityListener(listener);
        return listener;
    }

    /// <summary>L'activité de la requête s'arrête à la fin du pipeline, parfois juste après la réponse.</summary>
    private static async Task<Activity> WaitForRequestAsync(ConcurrentQueue<Activity> activities, string path, string? expectedPlayerId)
    {
        bool Matches(Activity a) =>
            a.GetTagItem("url.path") as string == path && a.GetTagItem("inseconds.player_id") as string == expectedPlayerId;

        for (var i = 0; i < 40 && !activities.Any(Matches); i++)
            await Task.Delay(50, Ct);
        return Assert.Single(activities, Matches);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Garde, pour chaque entrée, son message et les scopes ouverts à ce moment.</summary>
    private sealed class ScopeCapturingLoggerProvider : ILoggerProvider, ISupportExternalScope
    {
        private readonly ConcurrentQueue<(string Message, string Scopes)> _entries = new();
        private IExternalScopeProvider _scopes = new LoggerExternalScopeProvider();

        public IReadOnlyCollection<(string Message, string Scopes)> Entries => _entries;

        public void SetScopeProvider(IExternalScopeProvider scopeProvider) => _scopes = scopeProvider;

        public ILogger CreateLogger(string categoryName) => new Logger(this);

        public void Dispose()
        {
        }

        private sealed class Logger(ScopeCapturingLoggerProvider owner) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => owner._scopes.Push(state);

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                var scopes = new List<string>();
                owner._scopes.ForEachScope(
                    (scope, list) =>
                    {
                        if (scope is IEnumerable<KeyValuePair<string, object>> pairs)
                            list.AddRange(pairs.Select(p => $"{p.Key}={p.Value}"));
                        else if (scope is IEnumerable<KeyValuePair<string, object?>> nullablePairs)
                            list.AddRange(nullablePairs.Select(p => $"{p.Key}={p.Value}"));
                        else
                            list.Add(scope?.ToString() ?? "");
                    },
                    scopes);
                owner._entries.Enqueue((formatter(state, exception), string.Join(" ", scopes)));
            }
        }
    }
}
