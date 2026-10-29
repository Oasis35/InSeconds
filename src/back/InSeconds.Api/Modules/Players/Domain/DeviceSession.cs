namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Un appareil connecté, invité compris. Le cookie porte son identifiant ; la
/// validation du cookie vérifie qu'il n'est pas révoqué. Chaque appareil a la sienne : déconnecter
/// un appareil ne touche pas les autres (piège 39).
/// </summary>
public sealed class DeviceSession
{
    private DeviceSession()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence), pour être mis dans le cookie avant l'enregistrement.</summary>
    public int Id { get; private set; }

    public Guid PlayerId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    /// <summary>Dernière visite depuis cet appareil, notée au plus toutes les 5 minutes.</summary>
    public DateTimeOffset LastSeenAt { get; private set; }

    public DateTimeOffset? RevokedAt { get; private set; }

    /// <summary>Libellé grossier de l'appareil (« Chrome · Android »), pour la liste des appareils du profil.</summary>
    public string? UserAgentLabel { get; private set; }

    /// <param name="userAgentLabel">Libellé calculé à l'ouverture (<c>DeviceLabel</c>), jamais l'en-tête brut.</param>
    public static DeviceSession Open(Guid playerId, DateTimeOffset now, string? userAgentLabel = null) =>
        new() { PlayerId = playerId, CreatedAt = now, LastSeenAt = now, UserAgentLabel = userAgentLabel };

    /// <summary>Plus accepté par la validation du cookie. Une session déjà révoquée garde sa date.</summary>
    public void Revoke(DateTimeOffset now) => RevokedAt ??= now;
}
