using InSeconds.Api.Modules.Players.Domain;

namespace InSeconds.UnitTests.Players;

/// <summary>La source d'arrivée d'un invité, nettoyée avant d'aller en base et dans la télémétrie (#445).</summary>
public class AcquisitionSourceTests
{
    [Theory]
    [InlineData("instagram", "instagram")]
    [InlineData("TikTok", "tiktok")]
    [InlineData("  share ", "share")]
    [InlineData("google.com", "google.com")]
    [InlineData("com.google.android.gm", "com.google.android.gm")]
    [InlineData("news_letter-2", "news_letter-2")]
    public void SourceBienFormee_EnMinuscules(string raw, string expected) =>
        Assert.Equal(expected, AcquisitionSource.Normalize(raw));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void SourceAbsente_Direct(string? raw) =>
        Assert.Equal(AcquisitionSource.Direct, AcquisitionSource.Normalize(raw));

    [Theory]
    [InlineData("alice@example.com")]
    [InlineData("insta gram")]
    [InlineData("https://instagram.com/x")]
    [InlineData("instagrâm")]
    [InlineData("<script>")]
    public void SourceMalFormee_Other(string raw) =>
        Assert.Equal(AcquisitionSource.Other, AcquisitionSource.Normalize(raw));

    [Fact]
    public void Au_Plus40Caracteres()
    {
        Assert.Equal(new string('a', 40), AcquisitionSource.Normalize(new string('a', 40)));
        Assert.Equal(AcquisitionSource.Other, AcquisitionSource.Normalize(new string('a', 41)));
    }
}
