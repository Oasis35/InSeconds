using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

/// <summary>Les chiffres d'un jour du tableau de bord de l'admin (F1, v1 : <c>GetAdminStats.BuildDailyKpis</c>).</summary>
public class DayKpisTests
{
    private static readonly DateOnly Day = new(2026, 10, 3);

    private static DaySessionRow Row(SessionStatus status, int score = 0) => new(Guid.NewGuid(), status, score);

    [Fact]
    public void JourEnCours_LesPartiesEnCoursRestentEnCours()
    {
        var kpis = DayKpisCalculator.Build(
            Day, [Row(SessionStatus.Completed, 4000), Row(SessionStatus.Abandoned), Row(SessionStatus.Expired), Row(SessionStatus.Pending)], isPast: false);

        Assert.Equal((1, 1, 1, 1, 4), (kpis.CompletedCount, kpis.AbandonedCount, kpis.ExpiredCount, kpis.PendingCount, kpis.TotalSessions));
        Assert.Equal(25.0, kpis.CompletionRate);
    }

    [Fact]
    public void JourPasse_LesPartiesEnCoursSontReplieesSurLesExpirees_LeTotalNeChangePas()
    {
        var kpis = DayKpisCalculator.Build(
            Day, [Row(SessionStatus.Completed, 4000), Row(SessionStatus.Expired), Row(SessionStatus.Pending), Row(SessionStatus.Pending)], isPast: true);

        Assert.Equal((0, 3, 4), (kpis.PendingCount, kpis.ExpiredCount, kpis.TotalSessions));
    }

    [Fact]
    public void SansPartie_TousLesChiffresAZero_PasDeMediane()
    {
        var kpis = DayKpisCalculator.Build(Day, [], isPast: false);

        Assert.Equal((0, 0, 0, 0, 0, 0.0), (kpis.CompletedCount, kpis.AbandonedCount, kpis.ExpiredCount, kpis.PendingCount, kpis.TotalSessions, kpis.CompletionRate));
        Assert.Null(kpis.MedianScore);
    }

    [Fact]
    public void LeTauxDeCompletion_EstArrondiAUneDecimale()
    {
        var kpis = DayKpisCalculator.Build(
            Day, [Row(SessionStatus.Completed, 1), Row(SessionStatus.Abandoned), Row(SessionStatus.Abandoned)], isPast: true);

        Assert.Equal(33.3, kpis.CompletionRate);
    }

    [Fact]
    public void LaMediane_NeVientQueDesPartiesTerminees_EtPeutEtreDecimale()
    {
        var kpis = DayKpisCalculator.Build(
            Day, [Row(SessionStatus.Completed, 1000), Row(SessionStatus.Completed, 2001), Row(SessionStatus.Abandoned, 9000), Row(SessionStatus.Pending, 50)], isPast: false);

        Assert.Equal(1500.5, kpis.MedianScore);
    }
}
