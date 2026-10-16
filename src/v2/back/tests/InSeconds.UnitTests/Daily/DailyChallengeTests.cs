using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

public class DailyChallengeTests
{
    private static readonly DateOnly Day = new(2026, 10, 5);

    [Fact]
    public void Create_NumeroteLesMorceauxDe1AN_DansLOrdreDuTirage()
    {
        var challenge = DailyChallenge.Create(Day, ChallengeOrigin.Nightly, [42, 7, 19]);

        Assert.Equal([(short)1, (short)2, (short)3], challenge.Tracks.Select(t => t.Position));
        Assert.Equal([42, 7, 19], challenge.Tracks.Select(t => t.TrackId));
    }

    [Fact]
    public void Create_GardeLaDateLOrigineEtLaGraineDuJour()
    {
        var challenge = DailyChallenge.Create(Day, ChallengeOrigin.Admin, [1]);

        Assert.Equal((Day, Day.DayNumber, ChallengeOrigin.Admin), (challenge.Date, challenge.Seed, challenge.Origin));
    }

    [Fact]
    public void Create_RefuseUnDefiSansMorceau()
    {
        Assert.Throws<ArgumentException>(() => DailyChallenge.Create(Day, ChallengeOrigin.Nightly, []));
    }

    [Fact]
    public void Create_RefuseUnMorceauDeuxFois()
    {
        Assert.Throws<ArgumentException>(() => DailyChallenge.Create(Day, ChallengeOrigin.Nightly, [1, 2, 1]));
    }

    [Fact]
    public void Origines_ValeursStockeesDuPlan()
    {
        // § 4.4 : 1 nocturne, 2 à la volée, 3 admin (colonne smallint, ne jamais renuméroter).
        Assert.Equal([1, 2, 3], new[] { ChallengeOrigin.Nightly, ChallengeOrigin.OnTheFly, ChallengeOrigin.Admin }.Select(o => (int)o));
    }
}
