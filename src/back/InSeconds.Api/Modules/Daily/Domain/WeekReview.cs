namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Un jour de la semaine passée : son score si la partie est terminée, sinon rien.</summary>
public sealed record WeekReviewDay(DateOnly Date, int? Score);

/// <summary>Les chiffres de la semaine : jours joués, moyenne et meilleur jour (le plus ancien en cas d'égalité).</summary>
public sealed record WeekReviewStats(int PlayedCount, int? AverageScore, DateOnly? BestDay, int? BestScore);

/// <summary>
/// Le bilan de la semaine passée (du lundi au dimanche), calcul pur : toujours la date du défi (piège 18), sur les parties terminées seulement.
/// </summary>
public static class WeekReview
{
    public const int DaysInWeek = 7;

    /// <summary>Le lundi de la semaine d'avant celle d'<paramref name="today"/>.</summary>
    public static DateOnly StartOfLastWeek(DateOnly today)
    {
        var sinceMonday = ((int)today.DayOfWeek + 6) % 7;
        return today.AddDays(-sinceMonday - DaysInWeek);
    }

    /// <summary>Les sept jours de la semaine, du lundi au dimanche ; un jour sans partie terminée (ou sans défi) n'a pas de score.</summary>
    public static IReadOnlyList<WeekReviewDay> Days(DateOnly weekStart, IEnumerable<HistoryCalendarDay> played)
    {
        var byDate = played.Where(d => d.Score is not null).ToDictionary(d => d.Date, d => d.Score);
        return [.. Enumerable.Range(0, DaysInWeek).Select(i =>
        {
            var date = weekStart.AddDays(i);
            return new WeekReviewDay(date, byDate.GetValueOrDefault(date));
        })];
    }

    public static WeekReviewStats Stats(IReadOnlyList<WeekReviewDay> days)
    {
        var scored = days.Where(d => d.Score is not null).ToList();
        if (scored.Count == 0)
            return new WeekReviewStats(0, null, null, null);
        var best = scored.OrderByDescending(d => d.Score).ThenBy(d => d.Date).First();
        return new WeekReviewStats(scored.Count, (int)Math.Round(scored.Average(d => d.Score!.Value), MidpointRounding.AwayFromZero), best.Date, best.Score);
    }
}
