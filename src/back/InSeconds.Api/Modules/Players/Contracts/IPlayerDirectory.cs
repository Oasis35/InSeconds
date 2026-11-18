namespace InSeconds.Api.Modules.Players.Contracts;

/// <summary>Un compte (joueur non invité) tel que l'admin le lit : jamais de jeton ni d'appareil.</summary>
/// <param name="LastSeenAt">Dernière visite sur le site (la validation du cookie la note au plus toutes les 5 minutes), vide si jamais vu.</param>
public sealed record AccountSummary(Guid PlayerId, string Pseudo, string Email, DateTimeOffset CreatedAt, DateTimeOffset? LastSeenAt, bool IsAdmin);

/// <summary>Les joueurs non supprimés, comptés pour le tableau de bord de l'admin.</summary>
/// <param name="Guests">Joueurs sans compte.</param>
/// <param name="Registered">Joueurs avec un compte.</param>
/// <param name="ActiveLast7Days">Joueurs, invités compris, vus depuis 7 jours.</param>
/// <param name="ActiveLast30Days">Joueurs, invités compris, vus depuis 30 jours.</param>
public sealed record PlayerBreakdown(int Guests, int Registered, int ActiveLast7Days, int ActiveLast30Days);

/// <summary>Les joueurs arrivés par une source (<c>instagram</c>, <c>share</c>, <c>direct</c>, un domaine, <c>other</c>).</summary>
public sealed record ArrivalCount(string Source, int Count);

/// <summary>Ce que les autres modules ont besoin de savoir d'un joueur.</summary>
public interface IPlayerDirectory
{
    /// <summary>
    /// Le joueur a un compte (adresse et pseudo) : il n'est plus un invité. Les gels de série ne sont accordés qu'à un compte ;
    /// un joueur inconnu n'en a pas (un joueur supprimé ne peut plus s'authentifier : aucune requête ne l'atteint).
    /// </summary>
    Task<bool> HasAccountAsync(Guid playerId, CancellationToken ct);

    /// <summary>Le joueur existe et n'est pas supprimé (invité ou compte).</summary>
    Task<bool> ExistsAsync(Guid playerId, CancellationToken ct);

    /// <summary>
    /// Les comptes des joueurs non supprimés, les plus récemment vus d'abord, ceux qu'on n'a jamais vus en dernier (à égalité, le plus
    /// récemment créé d'abord).
    /// </summary>
    Task<IReadOnlyList<AccountSummary>> ListAccountsAsync(CancellationToken ct);

    /// <summary>
    /// Les pseudos de ces joueurs. **Un invité et un joueur supprimé n'y figurent pas** : une photo de statistiques figée garde un joueur
    /// supprimé après coup, son pseudo ne doit plus s'afficher.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, string>> GetPseudosAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct);

    /// <summary>
    /// Les noms qu'on affiche à côté d'un joueur : le pseudo de son compte, à défaut celui que l'invité s'est donné. Un joueur sans pseudo
    /// (invité muet) et un joueur supprimé n'y figurent pas. Pour les écrans qui montrent les joueurs d'une playlist ; les statistiques
    /// d'un jour, elles, gardent <see cref="GetPseudosAsync"/> (jamais un pseudo d'invité).
    /// </summary>
    Task<IReadOnlyDictionary<Guid, string>> GetDisplayNamesAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct);

    /// <summary>Invités, comptes et joueurs actifs, vus de <paramref name="now"/> ; les joueurs supprimés ne comptent pas.</summary>
    Task<PlayerBreakdown> GetBreakdownAsync(DateTimeOffset now, CancellationToken ct);

    /// <summary>
    /// Les comptes créés ce jour-là (jour UTC du lien du compte) et toujours présents ; les plus anciens comptes, sans date de création, ne
    /// comptent jamais.
    /// </summary>
    Task<int> CountAccountsCreatedOnAsync(DateOnly day, CancellationToken ct);

    /// <summary>
    /// Les joueurs créés (au premier « Commencer ») du jour <paramref name="from"/> au jour <paramref name="to"/> compris (jours UTC) et toujours
    /// présents, par source d'arrivée, la plus fréquente d'abord ; les joueurs créés avant qu'on note la source n'y figurent pas.
    /// </summary>
    Task<IReadOnlyList<ArrivalCount>> CountArrivalsBySourceAsync(DateOnly from, DateOnly to, CancellationToken ct);
}
