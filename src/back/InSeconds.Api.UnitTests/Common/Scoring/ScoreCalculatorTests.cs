using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Scoring;

namespace InSeconds.Api.UnitTests.Common.Scoring;

public sealed class ScoreCalculatorTests
{
    private static readonly Dictionary<int, int> DefaultScores = new()
    {
        [1]  = 1000,
        [2]  = 850,
        [3]  = 700,
        [5]  = 500,
        [10] = 300,
        [15] = 150,
        [30] = 50,
    };

    private readonly ScoreCalculator _sut = new();

    // ---------------------------------------------------------------------------
    // Scores de base par palier — artiste + titre corrects, sans prolongation
    // ---------------------------------------------------------------------------

    [Theory]
    [InlineData(1,  1000)]
    [InlineData(2,  850)]
    [InlineData(3,  700)]
    [InlineData(5,  500)]
    [InlineData(10, 300)]
    [InlineData(15, 150)]
    [InlineData(30, 50)]
    public void Calculate_WhenBothCorrectNoExtension_ReturnsBaseScore(int duration, int expected)
    {
        _sut.Calculate(duration, wasExtended: false, artistCorrect: true, titleCorrect: true, DefaultScores)
            .Should().Be(expected);
    }

    // ---------------------------------------------------------------------------
    // Prolongation — score(palier_final) × 0.75
    // ---------------------------------------------------------------------------

    [Theory]
    [InlineData(1,  750)]
    [InlineData(2,  638)]  // 850 × 0.75 = 637.5 → arrondi à 638
    [InlineData(3,  525)]  // 700 × 0.75 = 525
    [InlineData(5,  375)]  // 500 × 0.75 = 375
    [InlineData(10, 225)]  // 300 × 0.75 = 225
    [InlineData(15, 112)]  // 150 × 0.75 = 112.5 → banker's rounding → 112
    [InlineData(30, 38)]   // 50  × 0.75 = 37.5  → arrondi à 38
    public void Calculate_WhenBothCorrectWithExtension_AppliesPenalty(int duration, int expected)
    {
        _sut.Calculate(duration, wasExtended: true, artistCorrect: true, titleCorrect: true, DefaultScores)
            .Should().Be(expected);
    }

    // ---------------------------------------------------------------------------
    // Scoring partiel — 50/50
    // ---------------------------------------------------------------------------

    [Fact]
    public void Calculate_WhenOnlyArtistCorrect_ReturnsHalfScore()
    {
        _sut.Calculate(3, wasExtended: false, artistCorrect: true, titleCorrect: false, DefaultScores)
            .Should().Be(350); // 700 × 0.5
    }

    [Fact]
    public void Calculate_WhenOnlyTitleCorrect_ReturnsHalfScore()
    {
        _sut.Calculate(3, wasExtended: false, artistCorrect: false, titleCorrect: true, DefaultScores)
            .Should().Be(350); // 700 × 0.5
    }

    [Fact]
    public void Calculate_WhenNoneCorrect_ReturnsZero()
    {
        _sut.Calculate(1, wasExtended: false, artistCorrect: false, titleCorrect: false, DefaultScores)
            .Should().Be(0);
    }

    // ---------------------------------------------------------------------------
    // Prolongation + scoring partiel combinés
    // ---------------------------------------------------------------------------

    [Fact]
    public void Calculate_WhenExtendedAndOnlyArtistCorrect_AppliesBothReductions()
    {
        // 5s → 500, ×0.75 = 375, ×0.5 = 188 (arrondi)
        _sut.Calculate(5, wasExtended: true, artistCorrect: true, titleCorrect: false, DefaultScores)
            .Should().Be(188);
    }

    // ---------------------------------------------------------------------------
    // Palier invalide / scores personnalisés
    // ---------------------------------------------------------------------------

    [Fact]
    public void Calculate_WhenDurationNotInScores_ReturnsZero()
    {
        _sut.Calculate(7, wasExtended: false, artistCorrect: true, titleCorrect: true, DefaultScores)
            .Should().Be(0);
    }

    [Fact]
    public void Calculate_WithCustomScores_UsesProvidedValues()
    {
        var customScores = new Dictionary<int, int> { [5] = 2000 };

        _sut.Calculate(5, wasExtended: false, artistCorrect: true, titleCorrect: true, customScores)
            .Should().Be(2000);
    }
}
