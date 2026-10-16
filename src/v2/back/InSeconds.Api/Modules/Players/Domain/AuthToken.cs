namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Jeton à usage unique envoyé par email (§ 4.2 du plan v2), fusion des tables v1
/// <c>MagicLinkTokens</c> et <c>EmailChangeTokens</c>. Seul son hash est stocké
/// (<see cref="AuthTokenSecret"/>). Connexion depuis B2, changement d'email en B3 ; toujours
/// cherché par <see cref="Purpose"/> (S2), valable 15 minutes, consommé une seule fois.
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

    /// <summary>Durée de validité d'un lien envoyé par email (affichée dans l'email : 15 minutes).</summary>
    public static readonly TimeSpan Validity = TimeSpan.FromMinutes(15);

    /// <summary>Jeton de connexion pour cette adresse (déjà normalisée).</summary>
    public static AuthToken IssueLogin(string email, byte[] tokenHash, DateTimeOffset now) =>
        new()
        {
            Purpose = AuthTokenPurpose.Login,
            Email = email,
            TokenHash = tokenHash,
            ExpiresAt = now + Validity,
            CreatedAt = now,
        };

    /// <summary>Jeton de changement d'email : ce joueur, vers cette nouvelle adresse (déjà normalisée).</summary>
    public static AuthToken IssueEmailChange(Guid playerId, string newEmail, byte[] tokenHash, DateTimeOffset now) =>
        new()
        {
            Purpose = AuthTokenPurpose.EmailChange,
            PlayerId = playerId,
            NewEmail = newEmail,
            TokenHash = tokenHash,
            ExpiresAt = now + Validity,
            CreatedAt = now,
        };

    public bool IsUsableAt(DateTimeOffset now) => ConsumedAt is null && ExpiresAt > now;

    public void Consume(DateTimeOffset now)
    {
        if (!IsUsableAt(now))
            throw new InvalidOperationException("Jeton déjà consommé ou expiré.");
        ConsumedAt = now;
    }
}

/// <summary>Usage d'un <see cref="AuthToken"/>. Valeurs stockées en base (<c>smallint</c>) : ne jamais les renuméroter.</summary>
public enum AuthTokenPurpose : short
{
    Login = 1,
    EmailChange = 2,
}
