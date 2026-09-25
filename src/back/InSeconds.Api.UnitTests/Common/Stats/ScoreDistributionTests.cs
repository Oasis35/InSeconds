using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Stats;

namespace InSeconds.Api.UnitTests.Common.Stats;

public sealed class ScoreDistributionTests
{
    // ---------------------------------------------------------------------------
    // Build — tranches de l'égaliseur
    // ---------------------------------------------------------------------------

    [Fact]
    public void Build_SansJoueur_RetourneDixTranchesVides()
    {
        var buckets = ScoreDistribution.Build([], 5000);

        buckets.Should().HaveCount(ScoreDistribution.BucketCount);
        buckets.Should().OnlyContain(b => b.Count == 0);
    }

    [Fact]
    public void Build_DecoupeLAxeEnTranchesDeMemeLargeur()
    {
        var buckets = ScoreDistribution.Build([], 5000);

        buckets[0].Should().Be(new ScoreBucketDto(0, 499, 0));
        buckets[1].Should().Be(new ScoreBucketDto(500, 999, 0));
        buckets[^1].Should().Be(new ScoreBucketDto(4500, 5000, 0));
    }

    [Fact]
    public void Build_RangeChaqueScoreDansSaTranche()
    {
        var buckets = ScoreDistribution.Build([0, 499, 500, 3150, 3200, 5000], 5000);

        buckets.Select(b => b.Count).Should().Equal(2, 1, 0, 0, 0, 0, 2, 0, 0, 1);
    }

    [Fact]
    public void Build_ScoreAuDelaDuMaximum_TombeDansLaDerniereTranche()
    {
        var buckets = ScoreDistribution.Build([6000], 5000);

        buckets[^1].Count.Should().Be(1);
    }

    [Fact]
    public void Build_MaximumNul_RetourneListeVide()
    {
        ScoreDistribution.Build([100], 0).Should().BeEmpty();
    }

    // ---------------------------------------------------------------------------
    // BetterThanPercent — % des autres joueurs battus
    // ---------------------------------------------------------------------------

    [Fact]
    public void BetterThanPercent_SansScoreJoueur_RetourneNull()
    {
        ScoreDistribution.BetterThanPercent([100, 200], null).Should().BeNull();
    }

    [Fact]
    public void BetterThanPercent_JoueurSeul_RetourneNull()
    {
        ScoreDistribution.BetterThanPercent([1000], 1000).Should().BeNull();
    }

    [Fact]
    public void BetterThanPercent_ExclutLeJoueurDuDenominateur()
    {
        // Autres joueurs : 100, 200, 500, 900 → 2 battus sur 4 = 50 %
        ScoreDistribution.BetterThanPercent([100, 200, 300, 500, 900], 300).Should().Be(50);
    }

    [Fact]
    public void BetterThanPercent_EgaliteNeCompteNiCommeBattuNiCommeBattant()
    {
        // Autres joueurs : 300, 300 → aucun strictement en dessous
        ScoreDistribution.BetterThanPercent([300, 300, 300], 300).Should().Be(0);
    }

    [Fact]
    public void BetterThanPercent_MeilleurScore_Retourne100()
    {
        ScoreDistribution.BetterThanPercent([100, 200, 900], 900).Should().Be(100);
    }

    [Fact]
    public void BetterThanPercent_ArrondiAuPlusProche()
    {
        // Autres joueurs : 100, 200, 900 → 2 battus sur 3 = 66,7 % → 67
        ScoreDistribution.BetterThanPercent([100, 200, 500, 900], 500).Should().Be(67);
    }
}
