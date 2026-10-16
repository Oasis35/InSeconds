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

/// <summary>Ce que les autres modules ont besoin de savoir d'un joueur (§ 5.3 du plan v2).</summary>
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

    /// <summary>Invités, comptes et joueurs actifs, vus de <paramref name="now"/> ; les joueurs supprimés ne comptent pas.</summary>
    Task<PlayerBreakdown> GetBreakdownAsync(DateTimeOffset now, CancellationToken ct);
}
