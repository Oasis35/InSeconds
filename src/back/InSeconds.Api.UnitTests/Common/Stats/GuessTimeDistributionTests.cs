using FluentAssertions;
using InSeconds.Api.Common.Stats;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Stats;

public sealed class GuessTimeDistributionTests
{
    [Fact]
    public void Build_AucunPalierAutorise_RetourneListeVide()
    {
        var buckets = GuessTimeDistribution.Build([], new Dictionary<decimal, int> { [1m] = 5 });

        buckets.Should().BeEmpty();
    }

    [Fact]
    public void Build_PalierSansBonneReponse_RetourneZero()
    {
        var buckets = GuessTimeDistribution.Build([0.5m, 1m, 2m], new Dictionary<decimal, int>());

        buckets.Should().Equal(
            new DurationBucketDto(0.5m, 0),
            new DurationBucketDto(1m, 0),
            new DurationBucketDto(2m, 0));
    }

    [Fact]
    public void Build_TrieLesPaliersParOrdreCroissant_MemeSiEntreeNonTriee()
    {
        var buckets = GuessTimeDistribution.Build(
            [10m, 0.5m, 3m],
            new Dictionary<decimal, int> { [10m] = 1, [0.5m] = 2, [3m] = 3 });

        buckets.Select(b => b.DurationSeconds).Should().Equal(0.5m, 3m, 10m);
        buckets.Select(b => b.Count).Should().Equal(2, 3, 1);
    }

    [Fact]
    public void Build_IgnoreLesComptesSurUnPalierNonAutorise()
    {
        // Un palier retiré des settings après coup ne doit pas apparaître dans l'histogramme.
        var buckets = GuessTimeDistribution.Build(
            [1m],
            new Dictionary<decimal, int> { [1m] = 4, [99m] = 10 });

        buckets.Should().ContainSingle().Which.Should().Be(new DurationBucketDto(1m, 4));
    }
}
