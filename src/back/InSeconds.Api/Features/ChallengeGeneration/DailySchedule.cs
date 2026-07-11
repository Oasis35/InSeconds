namespace InSeconds.Api.Features.ChallengeGeneration;

internal static class DailySchedule
{
    /// <summary>
    /// Délai jusqu'à la prochaine occurrence de HH:00 UTC. Si on est pile sur
    /// l'heure cible, retourne 24h (pas de déclenchement immédiat).
    /// </summary>
    internal static TimeSpan DelayUntilNextUtcHour(int hour, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var next = now.Date.AddHours(hour);
        if (now >= next) next = next.AddDays(1);
        return next - now;
    }
}
