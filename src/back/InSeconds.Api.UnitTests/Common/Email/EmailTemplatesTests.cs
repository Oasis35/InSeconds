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

        subject.Should().Be("Tu es invité·e sur IN//SECONDS");
    }
}
