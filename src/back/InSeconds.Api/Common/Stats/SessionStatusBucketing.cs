namespace InSeconds.Api.Common.Stats;

/// <summary>
/// Requalifie Pending/Expired d'un jour passé : l'expiry paresseuse n'a pas encore basculé les
/// sessions Pending d'un joueur jamais revenu, elles comptent comme « non terminées » (Expired)
/// une fois le jour du défi révolu. Un défi du jour courant garde ses Pending tels quels (encore
/// réellement en cours). Utilisé par GetAdminStats.BuildDailyKpis et GetChallengeStats.BuildChallengeStats
/// (cf. piège racine sur la convergence des deux endpoints).
/// </summary>
public static class SessionStatusBucketing
{
    public static (int Pending, int Expired) ReclassifyPastDay(int pendingRaw, int expiredRaw, bool isPast)
        => isPast ? (0, expiredRaw + pendingRaw) : (pendingRaw, expiredRaw);
}
