using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

public class EarProfileTests
{
    // Un vendredi.
    private static readonly DateOnly Today = new(2026, 11, 20);

    [Fact]
    public void LaPeriode_CommenceUnLundiOuUnPremierDuMois()
    {
        Assert.Equal(new DateOnly(2026, 9, 28), EarProfile.PeriodStart(ProfilePeriods.EightWeeks, Today, null));
        Assert.Equal(new DateOnly(2026, 6, 1), EarProfile.PeriodStart(ProfilePeriods.SixMonths, Today, null));
        Assert.Equal(new DateOnly(2026, 4, 1), EarProfile.PeriodStart(ProfilePeriods.All, Today, new DateOnly(2026, 4, 2)));
        Assert.Equal(new DateOnly(2026, 11, 1), EarProfile.PeriodStart(ProfilePeriods.All, Today, null));
    }

    [Fact]
    public void HuitSemaines_UnPointParSemaine_MemeSansPartie()
    {
        var start = EarProfile.PeriodStart(ProfilePeriods.EightWeeks, Today, null);
        var mine = new[] { new DatedScore(new DateOnly(2026, 11, 16), 2000), new DatedScore(new DateOnly(2026, 11, 19), 3001), new DatedScore(new DateOnly(2026, 9, 1), 9999) };
        var players = new[] { new DayTotal(new DateOnly(2026, 11, 17), 4, 8000), new DayTotal(new DateOnly(2026, 11, 18), 2, 4000), new DayTotal(new DateOnly(2026, 10, 5), 3, 3000) };

        var points = EarProfile.Points(ProfilePeriods.EightWeeks, start, Today, mine, players);

        Assert.Equal(8, points.Count);
        Assert.Equal(new DateOnly(2026, 11, 16), points[^1].Start);
        // Sa semaine : (2000 + 3001) / 2 arrondi ; celle des joueurs : 6 parties, 12000 points. Hors période : ignoré.
        Assert.Equal(new ProfilePoint(new DateOnly(2026, 11, 16), 2501, 2000, 2), points[^1]);
        // Moins de 5 parties des joueurs : pas de moyenne.
        Assert.Equal(new ProfilePoint(new DateOnly(2026, 10, 5), null, null, 0), points.Single(p => p.Start == new DateOnly(2026, 10, 5)));
    }

    [Fact]
    public void SixMois_UnPointParMois()
    {
        var points = EarProfile.Points(ProfilePeriods.SixMonths, new DateOnly(2026, 6, 1), Today, [new DatedScore(new DateOnly(2026, 7, 31), 1000)], []);

        Assert.Equal([6, 7, 8, 9, 10, 11], points.Select(p => p.Start.Month));
        Assert.Equal(1000, points[1].Average);
    }

    [Fact]
    public void LaTendance_Compare28JoursAux28DAvant()
    {
        var scores = new[] { new DatedScore(Today, 2200), new DatedScore(Today.AddDays(-27), 2200), new DatedScore(Today.AddDays(-28), 2000), new DatedScore(Today.AddDays(-55), 2000) };

        Assert.Equal(10, EarProfile.TrendPercent(scores, Today));
        Assert.Null(EarProfile.TrendPercent([new DatedScore(Today, 2000)], Today));
    }

    [Fact]
    public void QuandTuTrouves_LesPartsParPalier_EtLesJoueursAuDessusDuSeuil()
    {
        var durations = new[] { 0.5m, 1m, 2m };
        var mine = new AnswerTally(10, 7, 5, new Dictionary<decimal, int> { [0.5m] = 2, [2m] = 5 });
        var few = new AnswerTally(99, 50, 40, new Dictionary<decimal, int> { [1m] = 60 });
        var many = new AnswerTally(200, 120, 90, new Dictionary<decimal, int> { [0.5m] = 20, [1m] = 60, [2m] = 40 });

        var (steps, notFound, playersNotFound) = EarProfile.Steps(durations, mine, many);
        Assert.Equal([(0.5m, 20, (int?)10), (1m, 0, 30), (2m, 50, 20)], steps.Select(s => (s.Seconds, s.Percent, s.PlayersPercent)));
        Assert.Equal((30, 40), (notFound, playersNotFound));

        var (hidden, _, none) = EarProfile.Steps(durations, mine, few);
        Assert.All(hidden, s => Assert.Null(s.PlayersPercent));
        Assert.Null(none);
    }

    [Fact]
    public void SansReponse_PasDePourcentage() =>
        Assert.Null(EarProfile.Steps([0.5m], AnswerTally.Empty, AnswerTally.Empty).NotFoundPercent);
}
