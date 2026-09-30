namespace InSeconds.Infrastructure.RateLimiting;

/// <summary>
/// Noms des politiques de rate limiting, repris de la v1. Un endpoint les pose avec
/// <c>RequireRateLimiting(RateLimitPolicies.X)</c> ; les limites sont dans
/// <see cref="RateLimitingServiceCollectionExtensions"/>.
/// </summary>
public static class RateLimitPolicies
{
    /// <summary>Demande de lien de connexion : contre l'« email bombing ».</summary>
    public const string MagicLinkRequest = "magic-link-request";

    /// <summary>Demande de changement d'email : même raison.</summary>
    public const string EmailChangeRequest = "email-change-request";

    /// <summary>Création d'un joueur invité, commune à toutes les routes qui en créent un.</summary>
    public const string PlayerCreation = "player-creation";

    /// <summary>Erreurs remontées par le front (public, sans authentification).</summary>
    public const string ClientErrorReport = "client-error-report";

    /// <summary>Recherche publique de morceaux (quota Deezer partagé par tous les joueurs).</summary>
    public const string CatalogueSearch = "deezer-search-public";
}
