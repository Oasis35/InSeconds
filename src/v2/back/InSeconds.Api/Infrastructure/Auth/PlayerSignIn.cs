using Microsoft.AspNetCore.Authentication;

namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>Pose ou retire le cookie d'un appareil (création d'invité, reprise d'un cookie v1, connexion, déconnexion).</summary>
public interface IPlayerSignIn
{
    Task SignInAsync(Guid playerId, int deviceSessionId, bool isAdmin);

    /// <summary>Supprime le cookie ; la suite de la requête est anonyme. La session se révoque à part.</summary>
    Task SignOutAsync();
}

public sealed class PlayerSignIn(IHttpContextAccessor accessor) : IPlayerSignIn
{
    public async Task SignInAsync(Guid playerId, int deviceSessionId, bool isAdmin)
    {
        var httpContext = accessor.HttpContext
            ?? throw new InvalidOperationException("Pas de requête HTTP en cours pour poser le cookie.");
        // Le ticket ne porte que le joueur et son appareil : le rôle, relu en base à chaque requête, n'y
        // est jamais écrit. Persistant : le cookie survit à la fermeture du navigateur, 90 jours glissants.
        await httpContext.SignInAsync(
            AuthSetup.Scheme,
            PlayerClaims.Create(playerId, deviceSessionId, isAdmin: false),
            new AuthenticationProperties { IsPersistent = true });
        // La suite de la requête voit déjà ce joueur, rôle compris.
        httpContext.User = PlayerClaims.Create(playerId, deviceSessionId, isAdmin);
    }

    public async Task SignOutAsync()
    {
        var httpContext = accessor.HttpContext
            ?? throw new InvalidOperationException("Pas de requête HTTP en cours pour retirer le cookie.");
        await httpContext.SignOutAsync(AuthSetup.Scheme);
        httpContext.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity());
    }
}
