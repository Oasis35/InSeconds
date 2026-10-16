namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Un joueur. Invité tant qu'il n'a pas de compte (<see cref="Account"/>) : plus d'indicateur
/// <c>is_guest</c> (§ 4.2 du plan v2). Jamais supprimé physiquement : <see cref="DeletedAt"/> marque
/// la suppression, et ses appareils ne sont alors plus acceptés.
/// </summary>
public sealed class Player
{
    private Player()
    {
    }

    public Guid Id { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    /// <summary>Dernière visite, notée au plus toutes les 5 minutes par la validation du cookie (R17).</summary>
    public DateTimeOffset? LastSeenAt { get; private set; }

    public DateTimeOffset? DeletedAt { get; private set; }

    public static Player CreateGuest(Guid id, DateTimeOffset now) =>
        new() { Id = id, CreatedAt = now, LastSeenAt = now };
}
