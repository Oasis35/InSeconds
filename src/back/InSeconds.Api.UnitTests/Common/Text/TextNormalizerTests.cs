using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Text;

namespace InSeconds.Api.UnitTests.Common.Text;

public sealed class TextNormalizerTests
{
    private readonly TextNormalizer _sut = new();

    // ---------------------------------------------------------------------------
    // Correspondances exactes
    // ---------------------------------------------------------------------------

    [Fact]
    public void IsMatch_WhenIdentical_ReturnsTrue() =>
        _sut.IsMatch("Daft Punk", "Daft Punk").Should().BeTrue();

    [Fact]
    public void IsMatch_WhenCaseDiffers_ReturnsTrue() =>
        _sut.IsMatch("daft punk", "Daft Punk").Should().BeTrue();

    [Fact]
    public void IsMatch_WhenAccentDiffers_ReturnsTrue() =>
        _sut.IsMatch("Beyonce", "Beyoncé").Should().BeTrue();

    // ---------------------------------------------------------------------------
    // Stop words
    // ---------------------------------------------------------------------------

    [Fact]
    public void IsMatch_WhenGivenHasExtraStopWord_ReturnsTrue() =>
        _sut.IsMatch("The Beatles", "Beatles").Should().BeTrue();

    [Fact]
    public void IsMatch_WhenExpectedHasStopWord_ReturnsTrue() =>
        _sut.IsMatch("Beatles", "The Beatles").Should().BeTrue();

    [Fact]
    public void IsMatch_WhenFeatIgnored_ReturnsTrue() =>
        _sut.IsMatch("Jay Z", "Jay-Z feat. Kanye West").Should().BeFalse(); // "kanye west" reste, trop différent

    // ---------------------------------------------------------------------------
    // Fautes de frappe (Levenshtein ≤ 2)
    // ---------------------------------------------------------------------------

    [Fact]
    public void IsMatch_WhenTypoWithin2_ReturnsTrue() =>
        _sut.IsMatch("Coldpaly", "Coldplay").Should().BeTrue(); // distance = 2

    [Fact]
    public void IsMatch_WhenTypoExceeds2_ReturnsFalse() =>
        _sut.IsMatch("Coldxyzabc", "Coldplay").Should().BeFalse(); // distance > 2

    // ---------------------------------------------------------------------------
    // Réponses vides ou nulles
    // ---------------------------------------------------------------------------

    [Fact]
    public void IsMatch_WhenGivenIsNull_ReturnsFalse() =>
        _sut.IsMatch(null, "Coldplay").Should().BeFalse();

    [Fact]
    public void IsMatch_WhenGivenIsEmpty_ReturnsFalse() =>
        _sut.IsMatch("", "Coldplay").Should().BeFalse();

    [Fact]
    public void IsMatch_WhenGivenIsWhitespace_ReturnsFalse() =>
        _sut.IsMatch("   ", "Coldplay").Should().BeFalse();

    // ---------------------------------------------------------------------------
    // Pas de correspondance
    // ---------------------------------------------------------------------------

    [Fact]
    public void IsMatch_WhenCompletelyDifferent_ReturnsFalse() =>
        _sut.IsMatch("Radiohead", "Coldplay").Should().BeFalse();
}
