using FluentAssertions;
using InSeconds.Api.Common.Auth;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Auth;

public sealed class MagicLinkTokenGeneratorTests
{
    [Fact]
    public void GenerateRawToken_DeuxAppels_ProduisentDesTokensDifferents()
    {
        var a = MagicLinkTokenGenerator.GenerateRawToken();
        var b = MagicLinkTokenGenerator.GenerateRawToken();

        a.Should().NotBe(b);
    }

    [Fact]
    public void GenerateRawToken_FormatBase64UrlSansCaracteresInvalidesPourUneUrl()
    {
        var token = MagicLinkTokenGenerator.GenerateRawToken();

        token.Should().NotContain("+").And.NotContain("/").And.NotContain("=");
    }

    [Fact]
    public void Hash_EstDeterministePourUneMemeEntree()
    {
        const string token = "un-token-de-test";

        MagicLinkTokenGenerator.Hash(token).Should().Be(MagicLinkTokenGenerator.Hash(token));
    }

    [Fact]
    public void Hash_DeuxTokensDifferents_ProduisentDesHashsDifferents()
    {
        MagicLinkTokenGenerator.Hash("token-a").Should().NotBe(MagicLinkTokenGenerator.Hash("token-b"));
    }
}
