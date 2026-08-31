using System.Net.Http.Json;
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
            // Ne jamais avaler silencieusement (cf. piège DeezerClient) — les appelants
            // (AddAllowedEmailHandler, SendTestEmailHandler) décident chacun s'il faut
            // logger un warning et continuer, ou remonter l'erreur au client.
            logger.LogWarning(ex, "Échec de l'envoi Resend à {To}", to);
            throw;
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            logger.LogWarning("Resend a répondu {Status} pour {To} : {Body}", response.StatusCode, to, body);
            throw new HttpRequestException($"Resend a répondu {(int)response.StatusCode} pour l'envoi à {to} : {body}");
        }
    }
}
