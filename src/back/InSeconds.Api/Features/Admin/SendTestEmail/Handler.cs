using InSeconds.Api.Common.Email;

namespace InSeconds.Api.Features.Admin.SendTestEmail;

// Outil de diagnostic email pour l'admin — contrairement à AddAllowedEmail, l'échec
// d'envoi n'est PAS avalé : c'est tout l'intérêt de ce bouton (remonter l'erreur
// réelle : clé API Resend invalide, domaine d'expéditeur non vérifié...). Aucun
// effet de bord sur les données métier (pas de Player, AllowedEmail ni
// MagicLinkToken créé).
public sealed class SendTestEmailHandler(IEmailSender emailSender)
{
    public async Task<IResult> Handle(SendTestEmailCommand command, CancellationToken cancellationToken)
    {
        const string subject = "[Test] IN//SECONDS";
        const string html = "<p>Si tu reçois cet email, la configuration d'envoi fonctionne.</p>";

        try
        {
            await emailSender.SendAsync(command.ToEmail, subject, html, cancellationToken);
        }
        catch (Exception ex)
        {
            return Results.Json(
                new { error = "email_send_failed", message = ex.Message },
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.Ok();
    }
}
