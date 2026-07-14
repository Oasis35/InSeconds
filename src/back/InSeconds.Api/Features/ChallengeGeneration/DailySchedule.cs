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
        return NextUtcHour(hour, now) - now;
    }

    /// <summary>
    /// Prochaine occurrence de HH:00 UTC (strictement dans le futur).
    /// </summary>
    internal static DateTime NextUtcHour(int hour, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var next = now.Date.AddHours(hour);
        if (now >= next) next = next.AddDays(1);
        return next;
    }

    /// <summary>
    /// Attend que l'horloge murale UTC atteigne la cible. Task.Delay mesure du temps
    /// monotone : sur ~24h il peut se réveiller une fraction de seconde avant l'heure
    /// murale visée (dérive NTP) — nuit du 12/07/2026, le générateur s'est réveillé
    /// avant minuit, a vu « défi déjà présent » pour la veille et a sauté le jour.
    /// On redort donc le reliquat tant que la cible n'est pas réellement atteinte.
    /// </summary>
    internal static async Task DelayUntilAsync(DateTime targetUtc, CancellationToken ct)
    {
        TimeSpan remaining;
        while ((remaining = targetUtc - DateTime.UtcNow) > TimeSpan.Zero)
            await Task.Delay(remaining, ct);
    }
}
