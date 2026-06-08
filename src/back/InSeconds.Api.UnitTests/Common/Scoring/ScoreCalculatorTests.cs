using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Scoring;

namespace InSeconds.Api.UnitTests.Common.Scoring;

public sealed class ScoreCalculatorTests
{
    private static readonly Dictionary<decimal, int> DefaultScores = new()
    {
        [0.50m] = 1000,
        [1m]    = 850,
        [1.5m]  = 700,
        [2m]    = 550,
        [3m]    = 400,
        [5m]    = 250,
        [10m]   = 100,
    };

    private readonly ScoreCalculator _sut = new();

    // ---------------------------------------------------------------------------
    // Scores de base par palier — artiste + titre corrects, sans prolongation
    // ---------------------------------------------------------------------------

    [Theory]
    [InlineData(0.50, 1000)]
    [InlineData(1,    850)]
    [InlineData(1.5,  700)]
    [InlineData(2,    550)]
    [InlineData(3,    400)]
    [InlineData(5,    250)]
    [InlineData(10,   100)]
    public void Calculate_WhenBothCorrectNoExtension_ReturnsBaseScore(double durationDouble, int expected)
    {
        var duration = (decimal)durationDouble;
        _sut.Calculate(duration, wasExtended: false, artistCorrect: true, titleCorrect: true, DefaultScores)
            .Should().Be(expected);
    }

    // ---------------------------------------------------------------------------
    // Prolongation — score(palier_final) × 0.75
    // ---------------------------------------------------------------------------

    [Theory]
    [InlineData(0.50, 750)]  // 1000 × 0.75 = 750
    [InlineData(1,    638)]  // 850  × 0.75 = 637.5 → 638
    [InlineData(1.5,  525)]  // 700  × 0.75 = 525
    [InlineData(2,    412)]  // 550  × 0.75 = 412.5 → banker's rounding → 412
    [InlineData(3,    300)]  // 400  × 0.75 = 300
    [InlineData(5,    188)]  // 250  × 0.75 = 187.5 → 188
    [InlineData(10,   75)]   // 100  × 0.75 = 75
    public void Calculate_WhenBothCorrectWithExtension_AppliesPenalty(double durationDouble, int expected)
    {
        var duration = (decimal)durationDouble;
        _sut.Calculate(duration, wasExtended: true, artistCorrect: true, titleCorrect: true, DefaultScores)
            .Should().Be(expected);
    }

    // ---------------------------------------------------------------------------
    // Scoring partiel — 50/50
    // ---------------------------------------------------------------------------

    [Fact]
    public void Calculate_WhenOnlyArtistCorrect_ReturnsHalfScore()
    {
        _sut.Calculate(3m, wasExtended: false, artistCorrect: true, titleCorrect: false, DefaultScores)
            .Should().Be(200); // 400 × 0.5
    }

    [Fact]
    public void Calculate_WhenOnlyTitleCorrect_ReturnsHalfScore()
    {
        _sut.Calculate(3m, wasExtended: false, artistCorrect: false, titleCorrect: true, DefaultScores)
            .Should().Be(200); // 400 × 0.5
    }

    [Fact]
    public void Calculate_WhenNoneCorrect_ReturnsZero()
    {
        _sut.Calculate(0.50m, wasExtended: false, artistCorrect: false, titleCorrect: false, DefaultScores)
            .Should().Be(0);
    }

    // ---------------------------------------------------------------------------
    // Prolongation + scoring partiel combinés
    // ---------------------------------------------------------------------------

    [Fact]
    public void Calculate_WhenExtendedAndOnlyArtistCorrect_AppliesBothReductions()
    {
        // 5s → 250, ×0.75 = 187.5 → 188, ×0.5 = 94
        _sut.Calculate(5m, wasExtended: true, artistCorrect: true, titleCorrect: false, DefaultScores)
            .Should().Be(94);
    }

    // ---------------------------------------------------------------------------
    // Palier invalide / scores personnalisés
    // ---------------------------------------------------------------------------

    [Fact]
    public void Calculate_WhenDurationNotInScores_ReturnsZero()
    {
        _sut.Calculate(7m, wasExtended: false, artistCorrect: true, titleCorrect: true, DefaultScores)
            .Should().Be(0);
    }

    [Fact]
    public void Calculate_WithCustomScores_UsesProvidedValues()
    {
        var customScores = new Dictionary<decimal, int> { [5m] = 2000 };

        _sut.Calculate(5m, wasExtended: false, artistCorrect: true, titleCorrect: true, customScores)
            .Should().Be(2000);
    }
}
