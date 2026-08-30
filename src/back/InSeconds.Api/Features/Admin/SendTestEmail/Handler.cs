using InSeconds.Api.Common.Email;

namespace InSeconds.Api.Features.Admin.SendTestEmail;

// Outil de diagnostic SMTP pour l'admin — contrairement à AddAllowedEmail, l'échec
// d'envoi n'est PAS avalé : c'est tout l'intérêt de ce bouton (remonter l'erreur
// réelle : connexion SMTP refusée, mot de passe d'application invalide, alias non
// vérifié côté Gmail...). Aucun effet de bord sur les données métier (pas de Player,
// AllowedEmail ni MagicLinkToken créé).
public sealed class SendTestEmailHandler(IEmailSender emailSender)
{
    public async Task<IResult> Handle(SendTestEmailCommand command, CancellationToken cancellationToken)
    {
        const string subject = "[Test] IN//SECONDS SMTP";
        const string html = "<p>Si tu reçois cet email, la configuration SMTP fonctionne.</p>";

        try
        {
            await emailSender.SendAsync(command.ToEmail, subject, html, cancellationToken);
        }
        catch (Exception ex)
        {
            return Results.Json(
                new { error = "smtp_send_failed", message = ex.Message },
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.Ok();
    }
}
