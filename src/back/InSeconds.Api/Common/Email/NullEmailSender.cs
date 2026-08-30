namespace InSeconds.Api.Common.Email;

// Development/Testing : logue l'email au lieu d'en envoyer un vrai (cohérent avec
// FakeDeezerHandler pour Testing). En Testing, les tests récupèrent le lien via
// l'endpoint /api/e2e/last-magic-link (lit directement le MagicLinkToken en base),
// ce logger sert surtout au développeur local qui veut voir le contenu de l'email.
public sealed class NullEmailSender(ILogger<NullEmailSender> logger, TestEmailCapture capture) : IEmailSender
{
    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        logger.LogInformation(
            "Email (non envoyé — NullEmailSender) à {To} — sujet: {Subject}\n{HtmlBody}",
            to, subject, htmlBody);

        capture.Record(to, subject, htmlBody);

        return Task.CompletedTask;
    }
}
