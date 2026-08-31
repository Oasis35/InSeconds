using FluentAssertions;
using InSeconds.Api.Common.Email;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Email;

public sealed class EmailTemplatesTests
{
    private const string MagicLinkUrl = "https://inseconds.cc/login/verify?token=abc123";

    [Fact]
    public void MagicLinkEmailTemplate_ContientLUrlPassee()
    {
        var (_, html) = MagicLinkEmailTemplate.Build(MagicLinkUrl);

        html.Should().Contain(MagicLinkUrl);
    }

    [Fact]
    public void MagicLinkEmailTemplate_MentionneLaDureeDe15Minutes()
    {
        var (_, html) = MagicLinkEmailTemplate.Build(MagicLinkUrl);

        html.Should().Contain("15 minutes");
        html.Should().NotContain("7 jours");
    }

    [Fact]
    public void MagicLinkEmailTemplate_SujetAttendu()
    {
        var (subject, _) = MagicLinkEmailTemplate.Build(MagicLinkUrl);

        subject.Should().Be("Ton lien de connexion IN//SECONDS");
    }

    [Fact]
    public void WhitelistInvitationEmailTemplate_ContientLUrlPassee()
    {
        var (_, html) = WhitelistInvitationEmailTemplate.Build(MagicLinkUrl);

        html.Should().Contain(MagicLinkUrl);
    }

    [Fact]
    public void WhitelistInvitationEmailTemplate_MentionneLaDureeDe7Jours()
    {
        var (_, html) = WhitelistInvitationEmailTemplate.Build(MagicLinkUrl);

        html.Should().Contain("7 jours");
        html.Should().NotContain("15 minutes");
    }

    [Fact]
    public void WhitelistInvitationEmailTemplate_SujetAttendu()
    {
        var (subject, _) = WhitelistInvitationEmailTemplate.Build(MagicLinkUrl);

        subject.Should().Be("Tu es invité·e à tester les comptes IN//SECONDS");
    }

    [Theory]
    [InlineData("magic-link")]
    [InlineData("whitelist-invitation")]
    public void Render_AppliqueLeLayoutPartageEtNeLaissePasDeJeton(string template)
    {
        var html = EmailTemplateRenderer.Render(
            template,
            new Dictionary<string, string> { ["MAGIC_LINK_URL"] = MagicLinkUrl });

        html.Should().Contain("<!DOCTYPE html>");
        html.Should().Contain(".da-grid::before");   // vient de _layout.html (layout appliqué)
        html.Should().Contain(MagicLinkUrl);
        html.Should().NotContain("{{MAGIC_LINK_URL}}");
        html.Should().NotContain("{{SECTION:");       // toutes les sections injectées
        html.Should().NotContain("<!--#");            // marqueurs de section consommés
    }

    [Fact]
    public void Render_TemplateInconnu_Leve()
    {
        var act = () => EmailTemplateRenderer.Render("does-not-exist", new Dictionary<string, string>());

        act.Should().Throw<InvalidOperationException>();
    }
}
