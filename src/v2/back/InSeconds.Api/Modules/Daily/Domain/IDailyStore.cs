namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Écritures du module Daily, et les lectures qui les précèdent. Rien n'est enregistré ici : dans un handler Wolverine,
/// la transaction est appliquée par Wolverine (<c>AutoApplyTransactions</c>).
/// </summary>
public interface IDailyStore
{
    /// <summary>
    /// Réserve la génération du défi de ce jour jusqu'à la fin de la transaction : une génération simultanée attend
    /// la fin de la première, puis voit son défi. Sans cela, deux générations qui se croisent calculeraient chacune
    /// un tirage, et la seconde échouerait sur l'index unique de la date.
    /// </summary>
    Task LockGenerationAsync(DateOnly day, CancellationToken ct);

    /// <summary>Le défi de ce jour, s'il existe.</summary>
    Task<DailyChallenge?> FindChallengeAsync(DateOnly day, CancellationToken ct);

    /// <summary>Le défi de cet identifiant, s'il existe.</summary>
    Task<DailyChallenge?> FindChallengeAsync(int challengeId, CancellationToken ct);

    ValueTask AddAsync(DailyChallenge challenge, CancellationToken ct);

    /// <summary>
    /// Réserve le démarrage d'une partie de ce joueur jusqu'à la fin de la transaction : deux démarrages simultanés (double clic, deux onglets)
    /// se suivent, le second voit la partie du premier et la reprend, au lieu d'échouer sur l'index unique <c>(joueur, défi)</c>.
    /// </summary>
    Task LockPlayerStartAsync(Guid playerId, CancellationToken ct);

    /// <summary>
    /// Passe en <see cref="SessionStatus.Expired"/> les parties de ce joueur restées en cours sur un défi d'un jour **avant** <paramref name="today"/>
    /// (expiration paresseuse : le joueur est parti sans terminer ni abandonner).
    /// </summary>
    Task ExpireStaleSessionsAsync(Guid playerId, DateOnly today, DateTimeOffset now, CancellationToken ct);

    /// <summary>La partie de ce joueur sur ce défi, avec ses réponses, suivie pour être modifiée.</summary>
    Task<DailySession?> FindSessionAsync(Guid playerId, int challengeId, CancellationToken ct);

    /// <summary>
    /// La partie de cet identifiant **si elle est à ce joueur** (la ligne d'un autre n'est jamais verrouillée), avec ses réponses, **verrouillée** jusqu'à la fin de la transaction : deux requêtes simultanées sur la
    /// même partie (deux envois de la même réponse, une réponse et un abandon) se suivent au lieu de se croiser.
    /// </summary>
    Task<DailySession?> FindSessionForUpdateAsync(int sessionId, Guid playerId, CancellationToken ct);

    /// <summary>Ajoute la partie et lui attribue tout de suite son identifiant (la réponse de démarrage le porte).</summary>
    ValueTask AddAsync(DailySession session, CancellationToken ct);

    /// <summary>La série de ce joueur, suivie pour être modifiée ; rien s'il n'en a pas encore.</summary>
    Task<DailyStreak?> FindStreakAsync(Guid playerId, CancellationToken ct);

    void Add(DailyStreak streak);
}
