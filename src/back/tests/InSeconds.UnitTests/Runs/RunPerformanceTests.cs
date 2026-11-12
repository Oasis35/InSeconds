using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

public class RunPerformanceTests
{
    [Theory]
    [InlineData(3, 4, 0.75)]
    [InlineData(4, 4, 1)]
    [InlineData(0, 4, 0)]
    [InlineData(9, 4, 1)]
    [InlineData(-1, 4, 0)]
    [InlineData(2, 0, 0)]
    public void OfGame_PartDesManchesPassees(int passed, int rounds, double expected) =>
        Assert.Equal(expected, RunPerformance.OfGame(passed, rounds));

    [Fact]
    public void Average_MoyenneDesParties_ZeroSansPartie()
    {
        Assert.Equal(0.5, RunPerformance.Average([1d, 0d, 0.5]));
        Assert.Equal(0d, RunPerformance.Average([]));
    }
}
