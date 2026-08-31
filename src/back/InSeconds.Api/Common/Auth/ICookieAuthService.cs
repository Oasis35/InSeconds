namespace InSeconds.Api.Common.Auth;

public interface ICookieAuthService
{
    Task<Guid> ResolveOrCreatePlayerAsync(HttpContext httpContext, CancellationToken ct = default);

    /// <summary>
    /// Résout le player depuis le cookie existant, sans jamais en créer un nouveau.
    /// Retourne null si le cookie est absent/invalide/inconnu (visiteur n'ayant jamais joué).
    /// </summary>
    Task<Guid?> TryResolvePlayerAsync(HttpContext httpContext, CancellationToken ct = default);

    /// <summary>
    /// Pose le cookie authToken pour l'AuthToken donné — utilisé par VerifyMagicLink/DevLogin
    /// quand le Player à connecter (cas Found d'AccountLinkingService) diffère de celui déjà
    /// résolu/créé pour la requête courante.
    /// </summary>
    void IssueCookie(HttpContext httpContext, Guid authToken);

    /// <summary>Supprime le cookie authToken (logout).</summary>
    void ClearCookie(HttpContext httpContext);
}
