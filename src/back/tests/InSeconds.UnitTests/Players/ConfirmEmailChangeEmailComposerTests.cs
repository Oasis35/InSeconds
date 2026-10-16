using InSeconds.Api.Modules.Players.Email;

namespace InSeconds.UnitTests.Players;

public class ConfirmEmailChangeEmailComposerTests
{
    [Fact]
    public void GabaritV1_LienEtNouvelleAdresse_SansJetonNonRemplace()
    {
        const string link = "https://inseconds.cc/account/confirm-email?token=abc_DEF-123";

        var email = new ConfirmEmailChangeEmailComposer().Compose(new ConfirmEmailChangeEmail(link, "nouvelle@example.com"));

        Assert.Equal("Confirme ta nouvelle adresse email IN//SECONDS", email.Subject);
        Assert.Contains(link, email.HtmlBody, StringComparison.Ordinal);
        Assert.Contains("nouvelle@example.com", email.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain("{{", email.HtmlBody, StringComparison.Ordinal);
    }

    [Fact]
    public void AdresseSaisie_EncodeeDansLeHtml()
    {
        var email = new ConfirmEmailChangeEmailComposer().Compose(
            new ConfirmEmailChangeEmail("https://inseconds.cc/account/confirm-email?token=x", "<script>@example.com"));

        Assert.DoesNotContain("<script>", email.HtmlBody, StringComparison.Ordinal);
        Assert.Contains("&lt;script&gt;@example.com", email.HtmlBody, StringComparison.Ordinal);
    }
}
