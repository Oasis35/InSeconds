namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Ce qu'un joueur a le droit de voir du défi du jour selon sa propre partie (piège 31) : les morceaux du jour et ses statistiques
/// (<c>stats/today</c>), les scores du jour des membres de ses groupes. Une seule règle pour les deux, sinon un score ou un morceau fuiterait par l'un
/// quand l'autre le cache.
/// </summary>
public static class TodayReveal
{
    /// <summary>
    /// Vrai pour une partie terminée ou expirée, ou abandonnée après au moins une réponse ; faux pour une partie en cours, abandonnée sans réponse,
    /// ou absente.
    /// </summary>
    public static bool Allows(SessionStatus? status, int answeredCount) => status switch
    {
        SessionStatus.Completed or SessionStatus.Expired => true,
        SessionStatus.Abandoned => answeredCount > 0,
        _ => false,
    };
}
