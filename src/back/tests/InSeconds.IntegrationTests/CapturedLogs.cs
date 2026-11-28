using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests;

/// <summary>Garde chaque journal de l'API d'un test : niveau, identifiant d'événement et message formaté.</summary>
internal sealed class CapturedLogs : ILoggerProvider
{
    private readonly ConcurrentQueue<Entry> _entries = new();

    public IReadOnlyCollection<Entry> Entries => _entries;

    public ILogger CreateLogger(string categoryName) => new Logger(_entries);

    public void Dispose()
    {
    }

    /// <param name="Exception">Le texte de l'exception (type, message, pile) quand le journal en porte une : une violation d'unicité de la base y citerait la valeur refusée.</param>
    internal sealed record Entry(LogLevel Level, int EventId, string Message, string? Exception = null);

    private sealed class Logger(ConcurrentQueue<Entry> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            entries.Enqueue(new Entry(logLevel, eventId.Id, formatter(state, exception), exception?.ToString()));
    }
}
