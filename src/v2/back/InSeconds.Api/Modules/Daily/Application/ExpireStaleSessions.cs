using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// Expire les parties de tous les joueurs restées en cours sur un défi plus vieux que la veille (revue de E4) : la v2 refuse déjà de les
/// jouer (<see cref="SessionAccess.OldestPlayableDay"/>), et l'état ne dépend plus du retour du joueur (l'expiration au démarrage d'une
/// partie reste en filet de sécurité). Lancée par la tâche <c>daily-close-day</c>, avant de figer les statistiques. Rend le nombre de parties.
/// </summary>
public sealed record ExpireStaleSessions;

public static class ExpireStaleSessionsHandler
{
    public static async Task<int> Handle(
        ExpireStaleSessions command, IDailyStore store, IGameCalendar calendar, ILogger<ExpireStaleSessions> logger, CancellationToken ct)
    {
        var before = SessionAccess.OldestPlayableDay(calendar.Today);
        var count = await store.ExpireAllStaleSessionsAsync(before, calendar.Now, ct);
        DailyLog.StaleSessionsExpired(logger, count, before);
        return count;
    }
}
