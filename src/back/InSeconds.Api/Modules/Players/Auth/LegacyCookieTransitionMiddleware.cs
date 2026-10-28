using System.Security.Cryptography;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Infrastructure.Http;
using Microsoft.AspNetCore.DataProtection;

namespace InSeconds.Api.Modules.Players.Auth;

/// <summary>
/// Reprise des anciens cookies sans déconnecter personne. L'ancien cookie
/// <c>authToken</c> ne contient que le jeton du joueur, chiffré par Data Protection avec ses
/// paramètres d'origine (nom d'application <c>InSeconds</c>, purpose <c>InSeconds.Auth.Cookie</c>)
/// et ses clés d'origine (dans <c>infra.data_protection_keys</c>). Le jeton est haché et cherché dans
/// <c>legacy_tokens</c> (S6) ; s'il y est, le navigateur reçoit un cookie d'appareil sur une nouvelle
/// session : tous les appareils d'un compte partagent le même ancien jeton. Un même jeton
/// converti depuis moins d'une minute retrouve sa session au lieu d'en ouvrir une autre
/// (<see cref="LegacyConversionCache"/>). L'ancien cookie est ensuite supprimé, qu'il ait servi ou non.
/// </summary>
internal sealed class LegacyCookieTransitionMiddleware(
    RequestDelegate next, IDataProtectionProvider dataProtection, IHostEnvironment environment, LegacyConversionCache conversions)
{
    public const string CookieName = "authToken";

    /// <summary>Purpose Data Protection de l'ancien cookie.</summary>
    public const string Purpose = "InSeconds.Auth.Cookie";

    private readonly IDataProtector _protector = dataProtection.CreateProtector(Purpose);

    public async Task InvokeAsync(HttpContext context, IPlayerSessions sessions, IPlayerSignIn signIn, TimeProvider time)
    {
        if (!context.Request.Cookies.TryGetValue(CookieName, out var raw))
        {
            await next(context);
            return;
        }

        // Déjà un cookie d'appareil valide : il l'emporte, l'ancien ne sert plus.
        if (context.User.Identity?.IsAuthenticated != true && TryReadToken(raw, out var token))
        {
            // Une erreur de base remonte (500) et garde l'ancien cookie : rien n'est perdu (piège 37).
            var opened = await conversions.GetOrOpenAsync(
                token,
                () => sessions.OpenFromLegacyTokenAsync(
                    token, time.GetUtcNow(), DeviceLabel.From(context.Request.Headers.UserAgent), context.RequestAborted),
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
            // Cookie falsifié, ou chiffré par une clé que l'API n'a pas.
            token = Guid.Empty;
            return false;
        }
    }
}
