namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Écritures du module Players, et les lectures qui les précèdent. Rien n'est enregistré ici : dans
/// un handler Wolverine, la transaction est appliquée par Wolverine (<c>AutoApplyTransactions</c>).
/// </summary>
public interface IPlayerStore
{
    void Add(Player player);

    void Add(Account account);

    void Add(AuthToken token);

    /// <summary>Ajoute la session et lui attribue tout de suite son identifiant, qui va dans le cookie.</summary>
    ValueTask AddAsync(DeviceSession session, CancellationToken ct);

    /// <summary>Le compte de cette adresse (comparaison sans casse), s'il existe.</summary>
    Task<AccountLookup?> FindAccountByEmailAsync(string email, CancellationToken ct);

    /// <summary>Pseudo déjà pris par un compte (comparaison sans casse).</summary>
    Task<bool> IsPseudoTakenAsync(string pseudo, CancellationToken ct);

    Task<bool> HasAccountAsync(Guid playerId, CancellationToken ct);

    /// <summary>
    /// Le jeton de cet usage (S2) qui a ce hash, encore utilisable à cet instant ; suivi, pour être
    /// consommé par la transaction en cours, et verrouillé jusqu'à sa fin : une vérification simultanée
    /// du même jeton attend, puis ne le trouve plus s'il a été consommé (usage unique).
    /// </summary>
    Task<AuthToken?> FindUsableTokenAsync(AuthTokenPurpose purpose, byte[] tokenHash, DateTimeOffset now, CancellationToken ct);

    /// <summary>Un jeton de cet usage, non consommé, a été émis pour cette adresse depuis <paramref name="since"/>.</summary>
    Task<bool> HasTokenIssuedSinceAsync(AuthTokenPurpose purpose, string email, DateTimeOffset since, CancellationToken ct);

    /// <summary>La session d'appareil, suivie pour être modifiée (révocation).</summary>
    Task<DeviceSession?> FindDeviceSessionAsync(int id, CancellationToken ct);

    /// <summary>Le compte de ce joueur, s'il en a un et n'est pas supprimé ; suivi pour être modifié.</summary>
    Task<Account?> FindAccountAsync(Guid playerId, CancellationToken ct);

    /// <summary>Pseudo déjà pris par un autre joueur que celui-ci (comparaison sans casse).</summary>
    Task<bool> IsPseudoTakenByAnotherAsync(string pseudo, Guid playerId, CancellationToken ct);

    /// <summary>Un jeton de cet usage, non consommé, a été émis pour ce joueur depuis <paramref name="since"/>.</summary>
    Task<bool> HasTokenIssuedForPlayerSinceAsync(AuthTokenPurpose purpose, Guid playerId, DateTimeOffset since, CancellationToken ct);

    /// <summary>Les sessions non révoquées de ce joueur, suivies pour être révoquées.</summary>
    Task<IReadOnlyList<DeviceSession>> FindActiveDeviceSessionsAsync(Guid playerId, CancellationToken ct);

    /// <summary>
    /// Supprime le hash du jeton v1 de ce joueur : un cookie v1 pas encore converti n'est plus accepté
    /// (« déconnecter les autres appareils »). Renvoie le nombre de lignes supprimées (0 ou 1).
    /// </summary>
    Task<int> DeleteLegacyTokenAsync(Guid playerId, CancellationToken ct);

    /// <summary>Supprime les jetons expirés, quel que soit leur usage ; renvoie leur nombre.</summary>
    Task<int> DeleteExpiredTokensAsync(DateTimeOffset now, CancellationToken ct);
}

/// <summary>Le compte trouvé pour une adresse, et l'état de son joueur.</summary>
public sealed record AccountLookup(Guid PlayerId, bool IsAdmin, bool PlayerDeleted);
