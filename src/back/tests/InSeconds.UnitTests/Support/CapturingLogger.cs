using Microsoft.Extensions.Logging;

namespace InSeconds.UnitTests.Support;

public sealed record CapturedLog(LogLevel Level, EventId EventId, string Message, Exception? Exception, IReadOnlyList<KeyValuePair<string, object?>> Properties);

/// <summary>
/// Logger qui garde chaque entrée. Les propriétés sont copiées au moment de l'appel : l'état des
/// <c>[LoggerMessage]</c> est recyclé dès le retour de <c>Log</c> (piège 29 du CLAUDE.md racine).
/// </summary>
public sealed class CapturingLogger<T> : ILogger<T>
{
    private readonly List<CapturedLog> _entries = [];

    public IReadOnlyList<CapturedLog> Entries => _entries;

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        var properties = state is IEnumerable<KeyValuePair<string, object?>> pairs ? pairs.ToList() : [];
        _entries.Add(new CapturedLog(logLevel, eventId, formatter(state, exception), exception, properties));
    }
}
