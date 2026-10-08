using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

public class DailyStreakTests
{
    private static readonly DateOnly Day = new(2026, 10, 5);
    private static readonly StreakRules Rules = new(FreezeEveryDays: 7, FreezeMax: 2, LostNudgeMinDays: 2);

    /// <summary>Une série dans cet état, restaurée comme le ferait EF (le code de production n'a aucune méthode réservée aux tests).</summary>
    private static DailyStreak Streak(int streak, DateOnly? lastPlayed, int freezes)
    {
        var s = DailyStreak.Create(Guid.NewGuid());
        Set(s, nameof(DailyStreak.CurrentStreak), streak);
        Set(s, nameof(DailyStreak.LastPlayedDate), lastPlayed);
        Set(s, nameof(DailyStreak.Freezes), (short)freezes);
        return s;
    }

    private static void Set(DailyStreak streak, string property, object? value) =>
        typeof(DailyStreak).GetProperty(property)!.SetValue(streak, value);

    // --- RecordCompletion ---

    [Fact]
    public void PremiereCompletion_SerieA1_SurLaDateDuDefi()
    {
        var streak = DailyStreak.Create(Guid.NewGuid());

        var effect = streak.RecordCompletion(Day, isLinked: false, Rules);

        Assert.Equal((1, (DateOnly?)Day, 0, false), (streak.CurrentStreak, streak.LastPlayedDate, effect.FreezesUsed, effect.FreezeEarned));
    }

    [Fact]
    public void JourSuivant_LaSerieMonte()
    {
        var streak = Streak(3, Day.AddDays(-1), 0);

        streak.RecordCompletion(Day, isLinked: true, Rules);

        Assert.Equal(4, streak.CurrentStreak);
    }

    [Fact]
    public void JourManque_Compte_ConsommeUnGel_EtLaSerieNeMontePasPourCeJourMaisContinue()
    {
        var streak = Streak(3, Day.AddDays(-2), 1);

        var effect = streak.RecordCompletion(Day, isLinked: true, Rules);

        Assert.Equal((4, 0, 1), (streak.CurrentStreak, (int)streak.Freezes, effect.FreezesUsed));
    }

    [Fact]
    public void DeuxJoursManques_DeuxGelsDisponibles_LesConsommeTous()
    {
        var streak = Streak(3, Day.AddDays(-3), 2);

        var effect = streak.RecordCompletion(Day, isLinked: true, Rules);

        Assert.Equal((4, 0, 2), (streak.CurrentStreak, (int)streak.Freezes, effect.FreezesUsed));
    }

    [Fact]
    public void PasAssezDeGels_LaSerieRepartA1_EtLesGelsNeSontPasConsommes()
    {
        var streak = Streak(5, Day.AddDays(-4), 1);

        var effect = streak.RecordCompletion(Day, isLinked: true, Rules);

        Assert.Equal((1, 1, 0), (streak.CurrentStreak, (int)streak.Freezes, effect.FreezesUsed));
    }

    [Fact]
    public void Invite_NeConsommeJamaisDeGel()
    {
        var streak = Streak(5, Day.AddDays(-2), 1);

        var effect = streak.RecordCompletion(Day, isLinked: false, Rules);

        Assert.Equal((1, 1, 0), (streak.CurrentStreak, (int)streak.Freezes, effect.FreezesUsed));
    }

    [Fact]
    public void ToutLesSeptJours_UnGelGagne_PourUnCompte()
    {
        var streak = Streak(6, Day.AddDays(-1), 0);

        var effect = streak.RecordCompletion(Day, isLinked: true, Rules);

        Assert.Equal((7, 1, true), (streak.CurrentStreak, (int)streak.Freezes, effect.FreezeEarned));
    }

    [Fact]
    public void GelGagne_PasAuDelaDuStockMaximum_NiPourUnInvite_NiSansRegle()
    {
        var full = Streak(6, Day.AddDays(-1), 2);
        var guest = Streak(6, Day.AddDays(-1), 0);
        var noRule = Streak(6, Day.AddDays(-1), 0);

        Assert.False(full.RecordCompletion(Day, true, Rules).FreezeEarned);
        Assert.False(guest.RecordCompletion(Day, false, Rules).FreezeEarned);
        Assert.False(noRule.RecordCompletion(Day, true, new StreakRules(0, 2, 2)).FreezeEarned);
        Assert.Equal(2, full.Freezes);
        Assert.Equal(0, guest.Freezes);
    }

    [Fact]
    public void GelOffert_AuMoinsUn_JamaisAuDelaDeCeQueLeJoueurAvait()
    {
        var empty = DailyStreak.Create(Guid.NewGuid());
        var rich = Streak(0, null, 2);

        empty.GrantAccountCreationFreeze();
        rich.GrantAccountCreationFreeze();

        Assert.Equal((1, 2), ((int)empty.Freezes, (int)rich.Freezes));
    }

    // --- la vue d'aujourd'hui ---

    [Fact]
    public void Vue_SansSerie_ActiveA0()
    {
        var view = DailyStreak.None(Day, isLinked: true, Rules);

        Assert.Equal((StreakStatus.Active, 0, 0, 7, 2), (view.Status, view.Streak, view.MissedDays, view.FreezeEveryDays, view.MaxFreezes));
    }

    [Fact]
    public void Vue_JourJoueOuHier_Active()
    {
        Assert.Equal(StreakStatus.Active, DailyStreak.Compute(4, Day.AddDays(-1), 0, Day, true, Rules).Status);
        Assert.Equal(StreakStatus.Active, DailyStreak.Compute(4, Day, 0, Day, true, Rules).Status);
    }

    [Fact]
    public void Vue_JoursManquesCouvertsParLesGels_Protegee_EtLeStockMontreLeRestant()
    {
        var view = DailyStreak.Compute(5, Day.AddDays(-2), 2, Day, isLinked: true, Rules);

        Assert.Equal((StreakStatus.Protected, 5, 1, 1), (view.Status, view.Streak, view.Freezes, view.MissedDays));
    }

    [Fact]
    public void Vue_PlusDeJoursManquesQueDeGels_Cassee_ValeZero()
    {
        var view = DailyStreak.Compute(5, Day.AddDays(-4), 2, Day, isLinked: true, Rules);

        Assert.Equal((StreakStatus.Broken, 0, 2, 3), (view.Status, view.Streak, view.Freezes, view.MissedDays));
    }

    [Fact]
    public void Vue_Invite_AucunGel_NiProchainGel_EtLaSerieSeCasseDesLePremierJourManque()
    {
        var view = DailyStreak.Compute(5, Day.AddDays(-2), 1, Day, isLinked: false, Rules);

        Assert.Equal((StreakStatus.Broken, 0, 0, 0, 0), (view.Status, view.Streak, view.Freezes, view.MaxFreezes, view.FreezeEveryDays));
        Assert.Null(view.NextFreezeInDays);
    }

    [Fact]
    public void Vue_SerieDUnInvitePerdue_AuDessusDuSeuil_LostStreak()
    {
        Assert.Equal(4, DailyStreak.Compute(4, Day.AddDays(-5), 0, Day, isLinked: false, Rules).LostStreak);
        Assert.Null(DailyStreak.Compute(1, Day.AddDays(-5), 0, Day, isLinked: false, Rules).LostStreak);
        Assert.Null(DailyStreak.Compute(4, Day.AddDays(-5), 0, Day, isLinked: true, Rules).LostStreak);
    }

    [Theory]
    [InlineData(0, 7)]
    [InlineData(3, 4)]
    [InlineData(6, 1)]
    [InlineData(7, 7)]
    public void Vue_ProchainGel_JoursRestantsAvantLeProchainMultiple(int streak, int expected) =>
        Assert.Equal(expected, DailyStreak.Compute(streak, Day, 0, Day, isLinked: true, Rules).NextFreezeInDays);

    [Fact]
    public void Vue_SansRegleDeGel_PasDeProchainGel()
    {
        Assert.Null(DailyStreak.Compute(3, Day, 0, Day, isLinked: true, new StreakRules(0, 2, 2)).NextFreezeInDays);
    }
}
