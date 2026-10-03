using System.Net;

namespace InSeconds.Api.Modules.Players.Email;

/// <param name="ConfirmUrl">Page du front qui confirme le changement, jeton compris.</param>
/// <param name="NewEmail">Adresse à confirmer, rappelée dans l'email.</param>
public sealed record ConfirmEmailChangeEmail(string ConfirmUrl, string NewEmail);

/// <summary>L'email de confirmation d'un changement d'adresse, sujet et gabarit de la v1 (<c>confirm-email-change.html</c>).</summary>
public sealed class ConfirmEmailChangeEmailComposer : IEmailComposer<ConfirmEmailChangeEmail>
{
    public const string Subject = "Confirme ta nouvelle adresse email IN//SECONDS";

    public ComposedEmail Compose(ConfirmEmailChangeEmail model) =>
        new(Subject, EmailTemplateRenderer.Render(
            "confirm-email-change",
            new Dictionary<string, string>
            {
                ["CONFIRM_URL"] = WebUtility.HtmlEncode(model.ConfirmUrl),
                // Saisie par le joueur : encodée, elle ne peut pas injecter de HTML dans l'email.
                ["NEW_EMAIL"] = WebUtility.HtmlEncode(model.NewEmail),
            }));
}
