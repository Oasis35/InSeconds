namespace InSeconds.Api.Common.Auth;

public interface ICookieAuthService
{
    Task<Guid> ResolveOrCreatePlayerAsync(HttpContext httpContext, CancellationToken ct = default);

    /// <summary>
    /// Résout le player depuis le cookie existant, sans jamais en créer un nouveau.
    /// Retourne null si le cookie est absent/invalide/inconnu (visiteur n'ayant jamais joué).
    /// </summary>
    Task<Guid?> TryResolvePlayerAsync(HttpContext httpContext, CancellationToken ct = default);
}
