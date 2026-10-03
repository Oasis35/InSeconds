namespace InSeconds.Api.Modules.Players.Contracts;

/// <summary>
/// Les appareils connectés, vus par l'authentification (<c>Infrastructure/Auth</c>) : validation
/// du cookie, dernière visite, reprise d'un cookie v1 (§ 5.5 du plan v2). Une erreur de base
/// remonte telle quelle : elle ne doit jamais passer pour un cookie invalide (piège 37).
/// </summary>
public interface IPlayerSessions
{
    /// <summary>État de l'appareil en base. Inconnu, révoqué ou joueur supprimé : inactif.</summary>
    Task<DeviceSessionStatus> GetStatusAsync(Guid playerId, int deviceSessionId, CancellationToken ct);

    /// <summary>Note la visite de l'appareil et du joueur.</summary>
    Task RecordSeenAsync(Guid playerId, int deviceSessionId, DateTimeOffset now, CancellationToken ct);

    /// <summary>
    /// Ouvre une nouvelle session pour le joueur à qui appartient ce jeton v1, ou rien si le jeton
    /// est inconnu ou le joueur supprimé. Chaque appel crée sa propre session (un appareil chacun).
    /// </summary>
    Task<OpenedDeviceSession?> OpenFromLegacyTokenAsync(Guid legacyAuthToken, DateTimeOffset now, CancellationToken ct);
}

public sealed record DeviceSessionStatus(bool IsActive, bool IsAdmin, DateTimeOffset LastSeenAt)
{
    public static readonly DeviceSessionStatus Inactive = new(false, false, DateTimeOffset.MinValue);
}

public sealed record OpenedDeviceSession(Guid PlayerId, int DeviceSessionId, bool IsAdmin);
