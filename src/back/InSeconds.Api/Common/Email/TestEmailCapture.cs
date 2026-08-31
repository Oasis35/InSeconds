using System.Collections.Concurrent;

namespace InSeconds.Api.Common.Email;

// Singleton actif en Development/Testing (peuplé par NullEmailSender) — permet aux
// tests d'intégration/E2E de "recevoir" un email sans vrai envoi SMTP. Le token brut
// du magic link n'est jamais stocké en base (seul son hash SHA-256 l'est), donc c'est
// le seul moyen de récupérer l'URL de vérification réelle côté tests.
public sealed class TestEmailCapture
{
    private readonly ConcurrentDictionary<string, (string Subject, string Html)> _lastByRecipient = new();

    public void Record(string to, string subject, string html) =>
        _lastByRecipient[to] = (subject, html);

    public bool TryGetLast(string to, out (string Subject, string Html) email) =>
        _lastByRecipient.TryGetValue(to, out email);
}
