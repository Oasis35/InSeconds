namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Les chiffres d'un jour pour le tableau de bord de l'admin (v1 : <c>GetAdminStats.BuildDailyKpis</c>).
/// </summary>
/// <param name="AbandonedCount">Clic explicite sur « Abandonner » seulement.</param>
/// <param name="ExpiredCount">Sortie sans abandon ; pour un jour passé, les parties restées « en cours » y sont repliées.</param>
/// <param name="PendingCount">En cours : toujours 0 pour un jour passé.</param>
/// <param name="TotalSessions">Terminées, abandonnées, expirées et en cours.</param>
/// <param name="CompletionRate">Part de parties terminées, en %, à une décimale.</param>
public sealed record DayKpis(
    DateOnly Date, int CompletedCount, int AbandonedCount, int ExpiredCount, int PendingCount, int TotalSessions, double CompletionRate, double? MedianScore);

public static class DayKpisCalculator
{
    /// <param name="isPast">Le jour est révolu : une partie encore « en cours » n'a jamais été terminée, elle compte comme expirée.</param>
    public static DayKpis Build(DateOnly date, IReadOnlyCollection<DaySessionRow> sessions, bool isPast)
    {
        ArgumentNullException.ThrowIfNull(sessions);

        var completed = sessions.Count(s => s.Status == SessionStatus.Completed);
        var abandoned = sessions.Count(s => s.Status == SessionStatus.Abandoned);
        var expired = sessions.Count(s => s.Status == SessionStatus.Expired);
        var pending = sessions.Count(s => s.Status == SessionStatus.Pending);
        var total = sessions.Count;
        var (pendingCount, expiredCount) = isPast ? (0, expired + pending) : (pending, expired);

        var scores = sessions.Where(s => s.Status == SessionStatus.Completed).Select(s => s.TotalScore).ToList();
        return new DayKpis(
            date, completed, abandoned, expiredCount, pendingCount, total,
            total == 0 ? 0 : Math.Round((double)completed / total * 100, 1), Medians.Decimal(scores));
    }
}
