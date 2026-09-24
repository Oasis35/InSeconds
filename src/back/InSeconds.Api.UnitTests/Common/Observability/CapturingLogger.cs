using Microsoft.Extensions.Logging;

namespace InSeconds.Api.UnitTests.Common.Observability;

// Logger de test : garde chaque message formaté et chaque scope ouvert, pour vérifier ce qui
// part vers l'outil d'observabilité (et surtout ce qui n'y part pas).
public sealed class CapturingLogger<T> : ILogger<T>
{
    public List<string> Messages { get; } = [];
    public List<IReadOnlyList<KeyValuePair<string, object?>>> States { get; } = [];
    public List<object> Scopes { get; } = [];

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull
    {
        Scopes.Add(state);
        return null;
    }

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
        Func<TState, Exception?, string> formatter)
    {
        Messages.Add(formatter(state, exception));
        // Copie immédiate : l'état généré par [LoggerMessage] est réutilisé (et vidé) après l'appel.
        if (state is IEnumerable<KeyValuePair<string, object?>> properties)
            States.Add(properties.ToList());
    }
}
