namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Jeton à usage unique envoyé par email (§ 4.2 du plan v2), fusion des tables v1
/// <c>MagicLinkTokens</c> et <c>EmailChangeTokens</c>. Seul son hash est stocké. La table existe dès
/// B1 ; les jetons sont créés et vérifiés à partir de B2 (connexion) et B3 (changement d'email),
/// toujours filtrés sur <see cref="Purpose"/> (S2).
/// </summary>
public sealed class AuthToken
{
    private AuthToken()
    {
    }

    public int Id { get; private set; }

    public AuthTokenPurpose Purpose { get; private set; }

    /// <summary>Adresse à laquelle le lien de connexion a été envoyé (connexion).</summary>
    public string? Email { get; private set; }

    /// <summary>Joueur qui change d'adresse (changement d'email).</summary>
    public Guid? PlayerId { get; private set; }

    /// <summary>Nouvelle adresse, à confirmer (changement d'email).</summary>
    public string? NewEmail { get; private set; }

    public byte[] TokenHash { get; private set; } = null!;

    public DateTimeOffset ExpiresAt { get; private set; }

    public DateTimeOffset? ConsumedAt { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }
}

/// <summary>Usage d'un <see cref="AuthToken"/>. Valeurs stockées en base (<c>smallint</c>) : ne jamais les renuméroter.</summary>
public enum AuthTokenPurpose : short
{
    Login = 1,
    EmailChange = 2,
}
