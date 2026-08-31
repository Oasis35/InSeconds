namespace InSeconds.Api.Common.Email;

// Wording volontairement neutre ("tu as accès à IN//SECONDS" plutôt que "bienvenue,
// crée ton premier compte") : couvre aussi bien la première invitation que le cas où
// l'admin retire puis re-whitelist un email déjà lié à un compte existant.
// Sujet en dur ici, corps HTML dans Templates/whitelist-invitation.html.
public static class WhitelistInvitationEmailTemplate
{
    public static (string Subject, string Html) Build(string magicLinkUrl)
    {
        const string subject = "Tu es invité·e à tester les comptes IN//SECONDS";

        var html = EmailTemplateRenderer.Render(
            "whitelist-invitation",
            new Dictionary<string, string> { ["MAGIC_LINK_URL"] = magicLinkUrl });

        return (subject, html);
    }
}
