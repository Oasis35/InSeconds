using System.Net.Http.Json;
using InSeconds.Api.Common.Observability;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Common.Email;

public sealed class BrevoOptions
{
    public string ApiKey { get; set; } = "";
    public string SenderEmail { get; set; } = "";
    public string SenderName { get; set; } = "IN//SECONDS";
}

// Envoi via l'API transactionnelle Brevo (https://developers.brevo.com/reference/sendtransacemail) —
// remplace Resend (société française, données hébergées dans l'UE, quota gratuit plus large).
// HttpClient injecté via AddHttpClient<BrevoEmailSender> (BaseAddress + header
// api-key posés une fois à l'enregistrement, cf. Program.cs).
public sealed class BrevoEmailSender(HttpClient http, IOptions<BrevoOptions> options, ILogger<BrevoEmailSender> logger) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        var brevo = options.Value;
        var payload = new
        {
            sender = new { name = brevo.SenderName, email = brevo.SenderEmail },
            to = new[] { new { email = to } },
            subject,
            htmlContent = htmlBody,
        };

        HttpResponseMessage response;
        try
        {
            response = await http.PostAsJsonAsync("smtp/email", payload, ct);
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
            // Seul le code d'erreur Brevo (ex. "invalid_parameter") : son message peut citer
            // l'adresse du destinataire, qui ne doit jamais atteindre les logs.
            var errorCode = (await ReadJsonAsync<BrevoError>(response, ct))?.Code;
            PlayerActionLog.EmailFailed(logger, null, subject, (int)response.StatusCode);
            throw new HttpRequestException($"Brevo a répondu {(int)response.StatusCode} ({errorCode ?? "erreur inconnue"})");
        }

        // L'identifiant renvoyé par Brevo permet de retrouver l'envoi dans ses journaux transactionnels.
        var sent = await ReadJsonAsync<BrevoSentEmail>(response, ct);
        PlayerActionLog.EmailSent(logger, subject, sent?.MessageId);
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

    private sealed record BrevoSentEmail(string? MessageId);

    private sealed record BrevoError(string? Code);
}
