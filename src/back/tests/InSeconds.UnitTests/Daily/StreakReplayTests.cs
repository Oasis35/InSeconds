using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

public class StreakReplayTests
{
    private static readonly DateOnly Start = new(2026, 9, 15);
    private static readonly StreakRules Rules = new(FreezeEveryDays: 7, FreezeMax: 2, LostNudgeMinDays: 2);

    [Fact]
    public void AucunJour_PasDeSerie() =>
        Assert.Null(StreakReplay.Run(Guid.NewGuid(), [], isLinked: true, Rules));

    [Fact]
    public void Invite_JoursConsecutifs_SerieEtRecord_SansGel()
    {
        var streak = StreakReplay.Run(Guid.NewGuid(), [Start, Start.AddDays(1), Start.AddDays(2)], isLinked: false, Rules)!;

        Assert.Equal((3, 3, 0, Start.AddDays(2)), (streak.CurrentStreak, streak.BestStreak, (int)streak.Freezes, streak.LastPlayedDate!.Value));
    }

    [Fact]
    public void Invite_JourManque_SerieRepartA1_RecordGarde()
    {
        var streak = StreakReplay.Run(Guid.NewGuid(), [Start, Start.AddDays(1), Start.AddDays(2), Start.AddDays(4)], isLinked: false, Rules)!;

        Assert.Equal((1, 3), (streak.CurrentStreak, streak.BestStreak));
    }

    [Fact]
    public void Compte_PartAvecLeGelOffert_QuiCouvreUnJourManque()
    {
        var streak = StreakReplay.Run(Guid.NewGuid(), [Start, Start.AddDays(2)], isLinked: true, Rules)!;

        // Le jour manqué consomme le gel offert : la série continue, le stock est vide.
        Assert.Equal((2, 2, 0), (streak.CurrentStreak, streak.BestStreak, (int)streak.Freezes));
    }

    [Fact]
    public void Compte_SeptJoursDeSuite_GagneUnGel()
    {
        var days = Enumerable.Range(0, 7).Select(Start.AddDays);
        var streak = StreakReplay.Run(Guid.NewGuid(), days, isLinked: true, Rules)!;

        Assert.Equal((7, 2), (streak.CurrentStreak, (int)streak.Freezes));
    }

    [Fact]
    public void LOrdreEtLesDoublonsNeComptentPas()
    {
        var streak = StreakReplay.Run(Guid.NewGuid(), [Start.AddDays(1), Start, Start, Start.AddDays(1)], isLinked: false, Rules)!;

        Assert.Equal(2, streak.CurrentStreak);
    }
}
