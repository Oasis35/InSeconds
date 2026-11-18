using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

public class RunRulesTests
{
    [Fact]
    public void ReglesParDefaut_TroisViesEtSixPaliers()
    {
        var rules = RunsOptions.DefaultRules();

        Assert.Equal((3, 3), (rules.Lives, rules.TracksPerRound));
        Assert.Equal((true, true, 8, 250, 500), (rules.RegainLife, rules.ShortenOnNoLifeLost && rules.HoldOnLifeLost, rules.MaxRounds, rules.LifeBonus, rules.CompleteBonus));
        Assert.True(rules.HasCap);
        Assert.Equal([10m, 5m, 3m, 2m, 1m, 0.5m], rules.ListenLadder);
        Assert.Equal([100, 200, 350, 550, 800, 1200], rules.StepPoints);
        Assert.Equal(5, rules.LastStep);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(5, 1)]
    [InlineData(6, 2)]
    [InlineData(10, 2)]
    [InlineData(11, 3)]
    public void LaManche_EstCelleDuGroupeDeCinqMorceaux(int position, int round) =>
        Assert.Equal(round, TestRules.Legacy().RoundOf(position));

    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 6)]
    [InlineData(4, 16)]
    public void LaPremierePositionDUneManche(int round, int position) =>
        Assert.Equal(position, TestRules.Legacy().FirstPositionOf(round));

    [Theory]
    [InlineData(0, 10)]
    [InlineData(3, 2)]
    [InlineData(5, 0.5)]
    [InlineData(9, 0.5)]
    [InlineData(-4, 10)]
    public void LEcoute_SuitLEchelle_EtLeDernierPalierSeRepete(int step, double seconds) =>
        Assert.Equal((decimal)seconds, RunsOptions.DefaultRules().ListenAt(step));

    [Fact]
    public void LesPoints_SuiventLePalier() =>
        Assert.Equal([100, 550, 1200, 1200], [.. new[] { 0, 3, 5, 8 }.Select(RunsOptions.DefaultRules().PointsAt)]);

    [Fact]
    public void UnePositionHorsBornes_Refusee() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => TestRules.Legacy().RoundOf(0));

    [Theory]
    [InlineData(0, 0, 0, 0, 0)]
    [InlineData(0, 5, 0, 0, 1)]
    [InlineData(2, 5, 0, 0, 3)]
    [InlineData(5, 5, 0, 0, 5)]
    [InlineData(2, 5, 0, 1, 1)]
    [InlineData(2, 4, 1, 0, 2)]
    [InlineData(0, 0, 1, 0, 0)]
    [InlineData(3, 3, 0, 1, 2)]
    public void LePalier_RaccourciSansErreur_AllongeAvecUneErreur_BougePasAvecDesMoities(int step, int full, int half, int failed, int expected) =>
        Assert.Equal(expected, RunSteps.Next(step, new RoundTally(full, half, failed), lastStep: 5));

    [Theory]
    [InlineData(0, 3, 0, 0, 1)]
    [InlineData(0, 2, 1, 0, 1)]
    [InlineData(0, 0, 3, 0, 1)]
    [InlineData(5, 3, 0, 0, 5)]
    [InlineData(2, 2, 0, 1, 1)]
    [InlineData(0, 2, 0, 1, 0)]
    [InlineData(2, 0, 0, 0, 2)]
    public void AvecLaRegleDAujourdhui_UneMancheSansVieRetireeFaitRaccourcir(int step, int full, int half, int failed, int expected) =>
        Assert.Equal(expected, RunSteps.Next(step, new RoundTally(full, half, failed), lastStep: 5, shortenOnNoLifeLost: true));

    [Theory]
    [InlineData(0, 2, 0, 1, 0)]
    [InlineData(2, 2, 0, 1, 2)]
    [InlineData(4, 0, 0, 3, 4)]
    [InlineData(2, 3, 0, 0, 3)]
    [InlineData(2, 0, 3, 0, 3)]
    public void AvecLaRegleDAujourdhui_UneVieEstPerdue_LePalierResteOuIlEstAtteint(int step, int full, int half, int failed, int expected) =>
        Assert.Equal(expected, RunSteps.Next(step, new RoundTally(full, half, failed), lastStep: 5, shortenOnNoLifeLost: true, holdOnLifeLost: true));
}
