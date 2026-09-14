namespace InSeconds.Api.Common.Email;

// Sujet en dur ici, corps HTML dans Templates/confirm-email-change.html (cf. EmailTemplateRenderer).
public static class ConfirmEmailChangeEmailTemplate
{
    public static (string Subject, string Html) Build(string confirmUrl, string newEmail)
    {
        const string subject = "Confirme ta nouvelle adresse email IN//SECONDS";

        var html = EmailTemplateRenderer.Render(
            "confirm-email-change",
            new Dictionary<string, string> { ["CONFIRM_URL"] = confirmUrl, ["NEW_EMAIL"] = newEmail });

        return (subject, html);
    }
}
