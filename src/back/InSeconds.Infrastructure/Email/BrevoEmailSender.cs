using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace InSeconds.Infrastructure.Email;

public sealed class BrevoOptions
{
    public const string Section = "Brevo";

    public string ApiKey { get; set; } = "";
    public string SenderEmail { get; set; } = "";
    public string SenderName { get; set; } = "IN//SECONDS";
}

/// <summary>
/// Envoi par l'API transactionnelle Brevo (https://developers.brevo.com/reference/sendtransacemail).
/// Le <see cref="HttpClient"/> arrive configuré (adresse de base et en-tête <c>api-key</c>), cf.
/// <see cref="EmailServiceCollectionExtensions"/>.
/// </summary>
public sealed class BrevoEmailSender(HttpClient http, IOptions<BrevoOptions> options, ILogger<BrevoEmailSender> logger) : IEmailSender
{
    public const string BaseAddress = "https://api.brevo.com/v3/";

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
            // Jamais avalé : l'appelant (un handler Wolverine) réessaie ou remonte l'erreur.
            EmailLog.EmailFailed(logger, ex, subject, null);
            throw;
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                // Seul le code d'erreur Brevo (ex. « invalid_parameter ») : son message peut citer
                // l'adresse du destinataire, qui ne doit jamais atteindre les journaux.
                var errorCode = (await ReadJsonAsync<BrevoError>(response, ct))?.Code;
                EmailLog.EmailFailed(logger, null, subject, (int)response.StatusCode);
                throw new HttpRequestException($"Brevo a répondu {(int)response.StatusCode} ({errorCode ?? "erreur inconnue"})");
            }

            // L'identifiant Brevo permet de retrouver l'envoi dans ses journaux transactionnels.
            var sent = await ReadJsonAsync<BrevoSentEmail>(response, ct);
            EmailLog.EmailSent(logger, subject, sent?.MessageId);
        }
    }

    private static async Task<T?> ReadJsonAsync<T>(HttpResponseMessage response, CancellationToken ct) where T : class
    {
        try
        {
            return await response.Content.ReadFromJsonAsync<T>(ct);
        }
        catch (JsonException)
        {
            return null; // Corps absent ou non JSON : le statut HTTP suffit.
        }
    }

    private sealed record BrevoSentEmail(string? MessageId);

    private sealed record BrevoError(string? Code);
}
