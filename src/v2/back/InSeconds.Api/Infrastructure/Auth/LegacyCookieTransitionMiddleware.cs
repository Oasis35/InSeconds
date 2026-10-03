using System.Security.Cryptography;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.DataProtection;

namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>
/// Reprise des cookies v1 sans déconnecter personne (§ 5.5 du plan v2). Le cookie v1
/// <c>authToken</c> ne contient que le jeton du joueur, chiffré par Data Protection avec les
/// paramètres de la v1 (nom d'application <c>InSeconds</c>, purpose <c>InSeconds.Auth.Cookie</c>,
/// R10) et les mêmes clés (copiées à l'import). Le jeton est haché et cherché dans
/// <c>legacy_tokens</c> (S6) ; s'il y est, le navigateur reçoit un cookie v2 sur une nouvelle session
/// d'appareil : en v1, tous les appareils d'un compte partagent le même jeton (R1). Un même jeton
/// converti depuis moins d'une minute retrouve sa session au lieu d'en ouvrir une autre
/// (<see cref="LegacyConversionCache"/>). L'ancien cookie est ensuite supprimé, qu'il ait servi ou non.
/// </summary>
internal sealed class LegacyCookieTransitionMiddleware(
    RequestDelegate next, IDataProtectionProvider dataProtection, IHostEnvironment environment, LegacyConversionCache conversions)
{
    public const string CookieName = "authToken";

    /// <summary>Purpose Data Protection du cookie v1 (<c>CookieAuthService</c> de la v1).</summary>
    public const string Purpose = "InSeconds.Auth.Cookie";

    private readonly IDataProtector _protector = dataProtection.CreateProtector(Purpose);

    public async Task InvokeAsync(HttpContext context, IPlayerSessions sessions, IPlayerSignIn signIn, TimeProvider time)
    {
        if (!context.Request.Cookies.TryGetValue(CookieName, out var raw))
        {
            await next(context);
            return;
        }

        // Déjà un cookie v2 valide : il l'emporte, l'ancien ne sert plus.
        if (context.User.Identity?.IsAuthenticated != true && TryReadToken(raw, out var token))
        {
            // Une erreur de base remonte (500) et garde l'ancien cookie : rien n'est perdu (piège 37).
            var opened = await conversions.GetOrOpenAsync(
                token,
                () => sessions.OpenFromLegacyTokenAsync(token, time.GetUtcNow(), context.RequestAborted),
                context.RequestAborted);
            if (opened is not null)
                await signIn.SignInAsync(opened.PlayerId, opened.DeviceSessionId, opened.IsAdmin);
        }

        context.Response.Cookies.Delete(CookieName, new CookieOptions
        {
            Path = "/",
            HttpOnly = true,
            Secure = AuthSetup.UsesSecureCookie(environment),
            SameSite = AuthSetup.UsesSecureCookie(environment) ? SameSiteMode.Lax : SameSiteMode.Strict,
        });
        await next(context);
    }

    private bool TryReadToken(string raw, out Guid token)
    {
        try
        {
            return Guid.TryParse(_protector.Unprotect(raw), out token);
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException)
        {
            // Cookie falsifié, ou chiffré par une clé que la v2 n'a pas.
            token = Guid.Empty;
            return false;
        }
    }
}
