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
    // Scores de base par palier — artiste + titre corrects
    // ---------------------------------------------------------------------------
    // Le score ne dépend que du palier finalement écouté (peu importe qu'on l'ait
    // atteint directement ou via une prolongation "écouter plus") — pas de malus.

    [Theory]
    [InlineData(0.50, 1000)]
    [InlineData(1,    850)]
    [InlineData(1.5,  700)]
    [InlineData(2,    550)]
    [InlineData(3,    400)]
    [InlineData(5,    250)]
    [InlineData(10,   100)]
    public void Calculate_WhenBothCorrect_ReturnsBaseScoreOfFinalDuration(double durationDouble, int expected)
    {
        var duration = (decimal)durationDouble;
        _sut.Calculate(duration, artistCorrect: true, titleCorrect: true, DefaultScores)
            .Should().Be(expected);
    }

    // ---------------------------------------------------------------------------
    // Scoring partiel — 50/50
    // ---------------------------------------------------------------------------

    [Fact]
    public void Calculate_WhenOnlyArtistCorrect_ReturnsHalfScore()
    {
        _sut.Calculate(3m, artistCorrect: true, titleCorrect: false, DefaultScores)
            .Should().Be(200); // 400 × 0.5
    }

    [Fact]
    public void Calculate_WhenOnlyTitleCorrect_ReturnsHalfScore()
    {
        _sut.Calculate(3m, artistCorrect: false, titleCorrect: true, DefaultScores)
            .Should().Be(200); // 400 × 0.5
    }

    [Fact]
    public void Calculate_WhenNoneCorrect_ReturnsZero()
    {
        _sut.Calculate(0.50m, artistCorrect: false, titleCorrect: false, DefaultScores)
            .Should().Be(0);
    }

    // ---------------------------------------------------------------------------
    // Palier invalide / scores personnalisés
    // ---------------------------------------------------------------------------

    [Fact]
    public void Calculate_WhenDurationNotInScores_ReturnsZero()
    {
        _sut.Calculate(7m, artistCorrect: true, titleCorrect: true, DefaultScores)
            .Should().Be(0);
    }

    [Fact]
    public void Calculate_WithCustomScores_UsesProvidedValues()
    {
        var customScores = new Dictionary<decimal, int> { [5m] = 2000 };

        _sut.Calculate(5m, artistCorrect: true, titleCorrect: true, customScores)
            .Should().Be(2000);
    }

    // ---------------------------------------------------------------------------
    // Pénalité indice — appliquée après le calcul base/moitié, sur le score du
    // palier réellement écouté (pas de malus lié aux indices si hintLevelUsed=0).
    // ---------------------------------------------------------------------------

    private static readonly Dictionary<int, int> DefaultHintPenalty = new() { [1] = 30, [2] = 60 };

    [Fact]
    public void Calculate_WhenHintLevelZero_NoPenaltyApplied()
    {
        _sut.Calculate(5m, artistCorrect: true, titleCorrect: true, DefaultScores, hintLevelUsed: 0, DefaultHintPenalty)
            .Should().Be(250);
    }

    [Fact]
    public void Calculate_WhenHintLevel1_AppliesLevel1Penalty()
    {
        // 250 × (1 - 0.30) = 175
        _sut.Calculate(5m, artistCorrect: true, titleCorrect: true, DefaultScores, hintLevelUsed: 1, DefaultHintPenalty)
            .Should().Be(175);
    }

    [Fact]
    public void Calculate_WhenHintLevel2_AppliesLevel2Penalty()
    {
        // 100 × (1 - 0.60) = 40
        _sut.Calculate(10m, artistCorrect: true, titleCorrect: true, DefaultScores, hintLevelUsed: 2, DefaultHintPenalty)
            .Should().Be(40);
    }

    [Fact]
    public void Calculate_WhenHintLevelUsedButNoPenaltyDictProvided_NoPenaltyApplied()
    {
        _sut.Calculate(5m, artistCorrect: true, titleCorrect: true, DefaultScores, hintLevelUsed: 1, hintPenaltyPercent: null)
            .Should().Be(250);
    }

    [Fact]
    public void Calculate_WhenHintLevelHasNoMatchingPenaltyEntry_NoPenaltyApplied()
    {
        var partialPenalty = new Dictionary<int, int> { [2] = 60 }; // pas d'entrée niveau 1

        _sut.Calculate(5m, artistCorrect: true, titleCorrect: true, DefaultScores, hintLevelUsed: 1, partialPenalty)
            .Should().Be(250);
    }

    [Fact]
    public void Calculate_WhenHintUsedAndOnlyOneFieldCorrect_PenaltyAppliesAfterHalfScore()
    {
        // 400 × 0.5 = 200, puis × (1 - 0.30) = 140
        _sut.Calculate(3m, artistCorrect: true, titleCorrect: false, DefaultScores, hintLevelUsed: 1, DefaultHintPenalty)
            .Should().Be(140);
    }

    [Fact]
    public void Calculate_WhenNoneCorrectAndHintUsed_StillReturnsZero()
    {
        _sut.Calculate(5m, artistCorrect: false, titleCorrect: false, DefaultScores, hintLevelUsed: 2, DefaultHintPenalty)
            .Should().Be(0);
    }
}
