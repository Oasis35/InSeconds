namespace InSeconds.Api.Common.Email;

// Sujet en dur ici, corps HTML dans Templates/magic-link.html (cf. EmailTemplateRenderer).
public static class MagicLinkEmailTemplate
{
    public static (string Subject, string Html) Build(string magicLinkUrl)
    {
        const string subject = "Ton lien de connexion IN//SECONDS";

        var html = EmailTemplateRenderer.Render(
            "magic-link",
            new Dictionary<string, string> { ["MAGIC_LINK_URL"] = magicLinkUrl });

        return (subject, html);
    }
}
