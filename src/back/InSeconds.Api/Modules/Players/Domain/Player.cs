namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Un joueur. Invité tant qu'il n'a pas de compte (<see cref="Account"/>) : aucun indicateur
/// <c>is_guest</c>. Un joueur effacé disparaît pour de bon, avec ses données de jeu
/// (<c>AccountErasure</c>) : pas de suppression logique.
/// </summary>
public sealed class Player
{
    private Player()
    {
    }

    public Guid Id { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    /// <summary>Dernière visite, notée au plus toutes les 5 minutes par la validation du cookie.</summary>
    public DateTimeOffset? LastSeenAt { get; private set; }

    /// <summary>
    /// D'où vient le joueur, nettoyée par <see cref="Domain.AcquisitionSource"/> : notée à la création de l'invité, jamais changée
    /// ensuite. Vide pour un joueur créé par un lien de connexion, ou avant que la source ne soit notée.
    /// </summary>
    public string? AcquisitionSource { get; private set; }

    /// <summary>
    /// Le pseudo qu'un invité s'est donné (jamais celui d'un compte : <see cref="Account.Pseudo"/> a la priorité), retrouvé à chaque visite
    /// par son navigateur. Aucune unicité entre invités. Vide tant qu'il n'en a pas choisi.
    /// </summary>
    public string? GuestPseudo { get; private set; }

    public void SetGuestPseudo(string? pseudo) => GuestPseudo = pseudo;

    public static Player CreateGuest(Guid id, DateTimeOffset now, string? acquisitionSource = null) =>
        new() { Id = id, CreatedAt = now, LastSeenAt = now, AcquisitionSource = acquisitionSource };
}
