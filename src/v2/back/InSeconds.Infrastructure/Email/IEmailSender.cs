namespace InSeconds.Infrastructure.Email;

/// <summary>Envoi d'un email transactionnel. Brevo en prod, redirigé en staging, capturé en test.</summary>
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default);
}
