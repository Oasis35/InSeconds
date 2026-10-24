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

    /// <summary>Demande de changement d'email : même raison. Par joueur (S11).</summary>
    public const string EmailChangeRequest = "email-change-request";

    /// <summary>Révocation d'appareils (un appareil, ou « déconnecter les autres ») : par joueur (S11).</summary>
    public const string DeviceRevocation = "device-revocation";

    /// <summary>Création d'un joueur invité, commune à toutes les routes qui en créent un.</summary>
    public const string PlayerCreation = "player-creation";

    /// <summary>Erreurs remontées par le front (public, sans authentification).</summary>
    public const string ClientErrorReport = "client-error-report";

    /// <summary>Rapports de violation de la CSP envoyés par le navigateur (public, sans cookie).</summary>
    public const string CspReport = "csp-report";

    /// <summary>Recherche publique de morceaux (quota Deezer partagé par tous les joueurs).</summary>
    public const string CatalogueSearch = "deezer-search-public";

    /// <summary>Réponses des jours passés et plan du site (publics ; la veille est calculée en direct).</summary>
    public const string DailyArchive = "daily-archive";

    /// <summary>Extrait d'un morceau d'un jour passé (public ; chaque appel interroge Deezer, quota partagé avec les parties).</summary>
    public const string DailyArchivePreview = "daily-archive-preview";

    /// <summary>Lancement d'un run (une nouvelle playlist tirée à chaque fois) : par joueur.</summary>
    public const string RunLaunch = "run-launch";

    /// <summary>Lecture du lien d'une playlist (public, sans authentification) : par IP, contre l'énumération des codes.</summary>
    public const string RunLink = "run-link";
}
