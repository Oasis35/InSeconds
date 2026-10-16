using InSeconds.Api.Modules.Players.Email;

namespace InSeconds.UnitTests.Players;

public class MagicLinkEmailComposerTests
{
    [Fact]
    public void GabaritV1_LienDansLeBoutonEtEnClair_SansJetonNonRemplace()
    {
        const string link = "https://inseconds.cc/account/login/verify?token=abc_DEF-123";

        var email = new MagicLinkEmailComposer().Compose(new MagicLinkEmail(link));

        Assert.Equal("Ton lien de connexion IN//SECONDS", email.Subject);
        Assert.Equal(3, email.HtmlBody.Split(link).Length - 1);
        Assert.Contains("15 minutes", email.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain("{{", email.HtmlBody, StringComparison.Ordinal);
    }
}
