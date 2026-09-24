using System.Net.Http.Json;
using InSeconds.Api.Common.Observability;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Common.Email;

public sealed class ResendOptions
{
    public string ApiKey { get; set; } = "";
    public string SenderEmail { get; set; } = "";
    public string SenderName { get; set; } = "IN//SECONDS";
}

// Envoi via l'API HTTP Resend (https://resend.com/docs/api-reference/emails/send-email) —
// remplace l'ancien SmtpEmailSender/MailKit (compte Gmail + alias "Envoyer en tant que").
// HttpClient injecté via AddHttpClient<ResendEmailSender> (BaseAddress + header
// Authorization posés une fois à l'enregistrement, cf. Program.cs).
public sealed class ResendEmailSender(HttpClient http, IOptions<ResendOptions> options, ILogger<ResendEmailSender> logger) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        var resend = options.Value;
        var payload = new
        {
            from = $"{resend.SenderName} <{resend.SenderEmail}>",
            to = new[] { to },
            subject,
            html = htmlBody,
        };

        HttpResponseMessage response;
        try
        {
            response = await http.PostAsJsonAsync("emails", payload, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Ne jamais avaler silencieusement (cf. piège DeezerClient) — l'appelant
            // (RequestMagicLinkHandler) décide s'il faut logger un warning et
            // continuer, ou remonter l'erreur au client. Jamais l'adresse du destinataire
            // dans les logs (règle de confidentialité de la télémétrie) : le sujet suffit.
            PlayerActionLog.EmailFailed(logger, ex, subject, null);
            throw;
        }

        if (!response.IsSuccessStatusCode)
        {
            // Seul le type d'erreur Resend (ex. "validation_error") : son message peut citer
            // l'adresse du destinataire, qui ne doit jamais atteindre les logs.
            var errorName = (await ReadJsonAsync<ResendError>(response, ct))?.Name;
            PlayerActionLog.EmailFailed(logger, null, subject, (int)response.StatusCode);
            throw new HttpRequestException($"Resend a répondu {(int)response.StatusCode} ({errorName ?? "erreur inconnue"})");
        }

        // L'identifiant renvoyé par Resend permet de retrouver l'envoi dans son tableau de bord.
        var sent = await ReadJsonAsync<ResendSentEmail>(response, ct);
        PlayerActionLog.EmailSent(logger, subject, sent?.Id);
    }

    private static async Task<T?> ReadJsonAsync<T>(HttpResponseMessage response, CancellationToken ct) where T : class
    {
        try
        {
            return await response.Content.ReadFromJsonAsync<T>(ct);
        }
        catch (System.Text.Json.JsonException)
        {
            return null; // Corps absent ou non JSON : on garde le statut HTTP, seul le détail manque.
        }
    }

    private sealed record ResendSentEmail(string? Id);

    private sealed record ResendError(string? Name);
}
