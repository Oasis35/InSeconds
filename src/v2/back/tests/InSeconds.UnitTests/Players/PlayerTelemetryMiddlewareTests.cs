using System.Diagnostics;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace InSeconds.UnitTests.Players;

/// <summary>Identité du joueur dans la télémétrie : tag de trace et scope de journal (§ 5.7 du plan v2).</summary>
public class PlayerTelemetryMiddlewareTests
{
    private static readonly Guid PlayerId = new("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task JoueurIdentifie_TagueLaTraceEtOuvreUnScopePlayerId()
    {
        var logger = new ScopeCapturingLogger();
        var next = new Probe(logger);
        var middleware = new PlayerTelemetryMiddleware(next.InvokeAsync, logger);

        using var activity = new Activity("test").Start();
        await middleware.InvokeAsync(new DefaultHttpContext(), new StubCurrentPlayer(PlayerId));

        Assert.True(next.Called);
        Assert.Equal("inseconds.player_id", PlayerTelemetryMiddleware.PlayerIdTag);
        Assert.Equal(PlayerId.ToString(), activity.GetTagItem(PlayerTelemetryMiddleware.PlayerIdTag));
        // Le seul tag ajouté est l'identifiant technique.
        Assert.Single(activity.TagObjects);
        // Le scope est ouvert pendant la suite du pipeline, puis refermé.
        var scope = Assert.Single(next.ScopesSeenByNext);
        Assert.Equal(PlayerId, scope["PlayerId"]);
        Assert.Equal(["PlayerId"], scope.Keys);
        Assert.Empty(logger.OpenScopes);
    }

    [Fact]
    public async Task VisiteurSansJoueur_NeTagueRienEtLaisseLaRequetePasser()
    {
        var logger = new ScopeCapturingLogger();
        var next = new Probe(logger);
        var middleware = new PlayerTelemetryMiddleware(next.InvokeAsync, logger);

        using var activity = new Activity("test").Start();
        await middleware.InvokeAsync(new DefaultHttpContext(), new StubCurrentPlayer(null));

        Assert.True(next.Called);
        Assert.Null(activity.GetTagItem(PlayerTelemetryMiddleware.PlayerIdTag));
        Assert.Empty(activity.TagObjects);
        Assert.Empty(next.ScopesSeenByNext);
        Assert.Equal(0, logger.ScopesOpened);
    }

    private sealed class StubCurrentPlayer(Guid? playerId) : ICurrentPlayer
    {
        public Guid? PlayerId => playerId;

        public int? DeviceSessionId => playerId is null ? null : 7;

        public bool IsAdmin => false;
    }

    /// <summary>Le « reste du pipeline » : note les scopes ouverts quand il s'exécute.</summary>
    private sealed class Probe(ScopeCapturingLogger logger)
    {
        public bool Called { get; private set; }

        public List<Dictionary<string, object>> ScopesSeenByNext { get; } = [];

        public Task InvokeAsync(HttpContext context)
        {
            Called = true;
            ScopesSeenByNext.AddRange(logger.OpenScopes.OfType<Dictionary<string, object>>());
            return Task.CompletedTask;
        }
    }

    private sealed class ScopeCapturingLogger : ILogger<PlayerTelemetryMiddleware>
    {
        private readonly List<object> _open = [];

        public IReadOnlyList<object> OpenScopes => _open;

        public int ScopesOpened { get; private set; }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull
        {
            ScopesOpened++;
            _open.Add(state);
            return new Closer(_open, state);
        }

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
        }

        private sealed class Closer(List<object> open, object scope) : IDisposable
        {
            public void Dispose() => open.Remove(scope);
        }
    }
}
