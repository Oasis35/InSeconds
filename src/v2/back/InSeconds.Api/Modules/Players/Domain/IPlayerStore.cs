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
    /// consommé par la transaction en cours.
    /// </summary>
    Task<AuthToken?> FindUsableTokenAsync(AuthTokenPurpose purpose, byte[] tokenHash, DateTimeOffset now, CancellationToken ct);

    /// <summary>Un jeton de cet usage, non consommé, a été émis pour cette adresse depuis <paramref name="since"/>.</summary>
    Task<bool> HasTokenIssuedSinceAsync(AuthTokenPurpose purpose, string email, DateTimeOffset since, CancellationToken ct);

    /// <summary>La session d'appareil, suivie pour être modifiée (révocation).</summary>
    Task<DeviceSession?> FindDeviceSessionAsync(int id, CancellationToken ct);
}

/// <summary>Le compte trouvé pour une adresse, et l'état de son joueur.</summary>
public sealed record AccountLookup(Guid PlayerId, bool IsAdmin, bool PlayerDeleted);
