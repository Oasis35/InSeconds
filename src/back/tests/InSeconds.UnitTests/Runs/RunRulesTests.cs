using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

public class RunRulesTests
{
    [Fact]
    public void ReglesParDefaut_QuatreManchesDeCinq()
    {
        var rules = RunsOptions.DefaultRules();

        Assert.Equal((4, 5, 20, 10m), (rules.Rounds, rules.TracksPerRound, rules.TrackCount, rules.ListenSeconds));
        Assert.Equal([40, 50, 60, 70], rules.ThresholdPercents);
    }

    [Theory]
    [InlineData(1, "1.00")]
    [InlineData(2, "1.33")]
    [InlineData(3, "1.67")]
    [InlineData(4, "2.00")]
    public void Multiplicateur_Interpole_DeUnADeux(int round, string expected) =>
        Assert.Equal(decimal.Parse(expected, System.Globalization.CultureInfo.InvariantCulture), RunsOptions.DefaultRules().MultiplierOf(round));

    [Fact]
    public void UneSeuleManche_LeMinimum() =>
        Assert.Equal(1.5m, new RunRules(1, 5, 10m, [50], 1.5m, 3m).MultiplierOf(1));

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    public void UneMancheHorsBornes_Refusee(int round) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => RunsOptions.DefaultRules().MultiplierOf(round));
}
