namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Le compte d'un joueur : email vérifié, pseudo, rôle admin (§ 4.2 du plan v2). Créé par la
/// connexion par lien magique : conversion de l'invité du navigateur, ou nouveau joueur. Un compte
/// déjà lié n'est jamais converti (piège 30). <see cref="LinkedAt"/> est vide pour les comptes repris
/// de la v1, dont la date de création du compte est inconnue. Le rôle admin ne se pose qu'en SQL.
/// </summary>
public sealed class Account
{
    private Account()
    {
    }

    public Guid PlayerId { get; private set; }

    public string Email { get; private set; } = null!;

    public string Pseudo { get; private set; } = null!;

    /// <summary>Rôle admin, relu en base à chaque validation du cookie (au plus une minute de retard).</summary>
    public bool IsAdmin { get; private set; }

    public DateTimeOffset? LinkedAt { get; private set; }

    /// <param name="email">Adresse vérifiée (lien magique), déjà normalisée.</param>
    public static Account Create(Guid playerId, string email, string pseudo, DateTimeOffset now) =>
        new() { PlayerId = playerId, Email = email, Pseudo = pseudo, LinkedAt = now };
}
