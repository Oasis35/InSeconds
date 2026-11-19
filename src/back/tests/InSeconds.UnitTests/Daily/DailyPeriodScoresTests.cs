using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

/// <summary>Les scores du Défi du jour pour le classement d'un groupe : le jour, la semaine glissante et les jours que le joueur qui regarde ne voit pas.</summary>
public class DailyPeriodScoresTests
{
    private const int Week = 7;
    private static readonly DateOnly Today = new(2026, 11, 19);
    private static readonly DateOnly Yesterday = Today.AddDays(-1);
    private static readonly Guid Alice = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid Bob = Guid.Parse("00000000-0000-0000-0000-00000000000b");
    private static readonly HashSet<DateOnly> NothingHidden = [];

    private static FinishedGame Game(Guid player, int daysAgo, int score) => new(player, Today.AddDays(-daysAgo), score);

    /// <summary>
    /// Les scores d'un joueur ; <paramref name="playedDaysAgo"/> : les jours joués comptés dans la semaine, en jours avant <see cref="Today"/>, du plus
    /// ancien au plus récent.
    /// </summary>
    private static void AssertScores(PlayerPeriodScores actual, bool playedToday, int? todayScore, int weekPoints, params int[] playedDaysAgo)
    {
        Assert.Equal(playedToday, actual.PlayedToday);
        Assert.Equal(todayScore, actual.TodayScore);
        Assert.Equal(weekPoints, actual.WeekPoints);
        Assert.Equal(playedDaysAgo.Select(d => Today.AddDays(-d)), actual.WeekPlayedDays);
    }

    [Fact]
    public void Semaine_SommeDesSeptDerniersJours_UnJourManqueVautZero()
    {
        // Joué aujourd'hui, avant-hier et il y a six jours (le premier jour de la semaine) ; hier et les autres jours manqués.
        var scores = DailyPeriodScores.Compute([Game(Alice, 0, 500), Game(Alice, 2, 300), Game(Alice, 6, 200)], Today, Week, NothingHidden);

        AssertScores(scores[Alice], true, 500, 1000, 6, 2, 0);
    }

    [Fact]
    public void Semaine_UnePartieDeSeptJours_NeComptePlus()
    {
        var scores = DailyPeriodScores.Compute([Game(Alice, 7, 900), Game(Bob, 7, 900), Game(Bob, 1, 100)], Today, Week, NothingHidden);

        Assert.False(scores.ContainsKey(Alice));
        AssertScores(scores[Bob], false, null, 100, 1);
    }

    [Fact]
    public void Semaine_UnDefiAVenir_NeCompteJamais() =>
        Assert.Empty(DailyPeriodScores.Compute([Game(Alice, -1, 900)], Today, Week, NothingHidden));

    [Fact]
    public void MinuitUtc_LeJourChange_LaPartieDHierNEstPlusCelleDuJour()
    {
        var games = new[] { Game(Alice, 0, 500) };

        var before = DailyPeriodScores.Compute(games, Today, Week, NothingHidden);
        var after = DailyPeriodScores.Compute(games, Today.AddDays(1), Week, NothingHidden);

        AssertScores(before[Alice], true, 500, 500, 0);
        AssertScores(after[Alice], false, null, 500, 0);
    }

    [Fact]
    public void PartieDeLaVeilleFinieApresMinuit_CompteSurLaDateDuDefi_Piege18()
    {
        // La partie porte la date de son défi (la veille), même finie à 0 h 30 : elle n'est pas la partie du jour.
        var scores = DailyPeriodScores.Compute([Game(Alice, 1, 400)], Today, Week, NothingHidden);

        AssertScores(scores[Alice], false, null, 400, 1);
    }

    [Fact]
    public void JourCache_AucunScoreDuJour_NiDansLaSemaine_QuiAJoueReste()
    {
        var scores = DailyPeriodScores.Compute([Game(Alice, 0, 500), Game(Alice, 1, 300), Game(Bob, 0, 700)], Today, Week, new HashSet<DateOnly> { Today });

        AssertScores(scores[Alice], true, null, 300, 1);
        AssertScores(scores[Bob], true, null, 0);
    }

    [Fact]
    public void VeilleCachee_SesScoresSortentDeLaSemaine()
    {
        var scores = DailyPeriodScores.Compute([Game(Bob, 0, 700), Game(Bob, 1, 900), Game(Bob, 2, 100)], Today, Week, new HashSet<DateOnly> { Yesterday });

        AssertScores(scores[Bob], true, 700, 800, 2, 0);
    }

    [Fact]
    public void HiddenDays_RienJoue_SeulLeJourEstCache() =>
        Assert.Equal([Today], DailyPeriodScores.HiddenDays(Today, []));

    [Fact]
    public void HiddenDays_JourFini_RienNEstCache() =>
        Assert.Empty(DailyPeriodScores.HiddenDays(Today, [new ViewerGame(Today, SessionStatus.Completed, 5)]));

    [Fact]
    public void HiddenDays_VeilleEnCoursApresMinuit_LaVeilleEstCachee_Piege18() =>
        Assert.Equal(
            [Yesterday, Today],
            DailyPeriodScores.HiddenDays(Today, [new ViewerGame(Yesterday, SessionStatus.Pending, 2)]).Order());

    [Theory]
    [InlineData(SessionStatus.Completed)]
    [InlineData(SessionStatus.Abandoned)]
    [InlineData(SessionStatus.Expired)]
    public void HiddenDays_VeilleQuiNEstPlusEnCours_NEstPasCachee(SessionStatus status) =>
        Assert.DoesNotContain(Yesterday, DailyPeriodScores.HiddenDays(Today, [new ViewerGame(Yesterday, status, 0)]));

    [Fact]
    public void WeekStart_SixJoursAvant() => Assert.Equal(new DateOnly(2026, 11, 13), DailyPeriodScores.WeekStart(Today, Week));
}
