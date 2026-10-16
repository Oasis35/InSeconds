using System.Collections.Concurrent;
using InSeconds.Infrastructure.Email;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace InSeconds.Api.Testing.Email;

public sealed record CapturedEmail(string To, string Subject, string HtmlBody, DateTimeOffset SentAt);

/// <summary>Remplace Brevo : les emails restent en mémoire, lus par <c>GET /api/e2e/last-email</c>.</summary>
public sealed class CapturingEmailSender(TimeProvider timeProvider) : IEmailSender
{
    private readonly ConcurrentQueue<CapturedEmail> _sent = new();

    public IReadOnlyCollection<CapturedEmail> Sent => _sent;

    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        _sent.Enqueue(new CapturedEmail(to, subject, htmlBody, timeProvider.GetUtcNow()));
        return Task.CompletedTask;
    }

    /// <summary>Dernier email envoyé à cette adresse (comparaison sans casse), ou <c>null</c>.</summary>
    public CapturedEmail? LastTo(string to) =>
        _sent.LastOrDefault(e => string.Equals(e.To, to, StringComparison.OrdinalIgnoreCase));

    public void Clear() => _sent.Clear();
}

public static class CapturingEmailSenderExtensions
{
    public static IServiceCollection AddCapturingEmailSender(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<CapturingEmailSender>();
        services.RemoveAll<IEmailSender>();
        services.AddSingleton<IEmailSender>(sp => sp.GetRequiredService<CapturingEmailSender>());
        return services;
    }
}
