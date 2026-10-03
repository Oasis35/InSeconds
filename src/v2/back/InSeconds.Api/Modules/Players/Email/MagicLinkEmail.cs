using System.Net;

namespace InSeconds.Api.Modules.Players.Email;

/// <param name="LinkUrl">Page du front qui confirme la connexion, jeton compris.</param>
public sealed record MagicLinkEmail(string LinkUrl);

/// <summary>L'email du lien de connexion, sujet et gabarit de la v1 (<c>magic-link.html</c>).</summary>
public sealed class MagicLinkEmailComposer : IEmailComposer<MagicLinkEmail>
{
    public const string Subject = "Ton lien de connexion IN//SECONDS";

    public ComposedEmail Compose(MagicLinkEmail model) =>
        new(Subject, EmailTemplateRenderer.Render(
            "magic-link",
            // Encodé pour un attribut HTML : le jeton est en base64url, mais l'adresse vient de la configuration.
            new Dictionary<string, string> { ["MAGIC_LINK_URL"] = WebUtility.HtmlEncode(model.LinkUrl) }));
}
