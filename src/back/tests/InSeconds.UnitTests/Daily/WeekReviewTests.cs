using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

public class WeekReviewTests
{
    [Theory]
    [InlineData("2026-10-05", "2026-09-28")] // lundi
    [InlineData("2026-10-07", "2026-09-28")] // mercredi
    [InlineData("2026-10-11", "2026-09-28")] // dimanche
    [InlineData("2026-10-12", "2026-10-05")] // lundi suivant
    public void LeLundiDeLaSemaineDerniere_NeDependQueDeLaSemaineEnCours(string today, string expected) =>
        Assert.Equal(DateOnly.Parse(expected), WeekReview.StartOfLastWeek(DateOnly.Parse(today)));

    private static HistoryCalendarDay Day(string date, int? score) => new(DateOnly.Parse(date), score is null ? HistoryDayKind.Missed : HistoryDayKind.Played, score, 4250);

    [Fact]
    public void LesSeptJours_SontCompletes_LesJoursSansPartieSontVides()
    {
        var days = WeekReview.Days(new DateOnly(2026, 9, 28), [Day("2026-09-29", 3000), Day("2026-10-01", null)]);

        Assert.Equal(7, days.Count);
        Assert.Equal(new DateOnly(2026, 10, 4), days[^1].Date);
        Assert.Equal([3000], days.Where(d => d.Score is not null).Select(d => d.Score!.Value));
    }

    [Fact]
    public void LesChiffres_Moyenne_MeilleurJour_EgaliteAuPlusAncien()
    {
        var days = WeekReview.Days(new DateOnly(2026, 9, 28), [Day("2026-09-28", 2000), Day("2026-09-30", 3001), Day("2026-10-02", 3001)]);

        var stats = WeekReview.Stats(days);

        Assert.Equal((3, (int?)2667, (DateOnly?)new DateOnly(2026, 9, 30), (int?)3001), (stats.PlayedCount, stats.AverageScore, stats.BestDay, stats.BestScore));
    }

    [Fact]
    public void SansPartie_PasDeChiffres() =>
        Assert.Equal(new WeekReviewStats(0, null, null, null), WeekReview.Stats(WeekReview.Days(new DateOnly(2026, 9, 28), [])));
}
