using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace InSeconds.Api.Infrastructure.Auth;

public static class AuthorizationPolicies
{
    /// <summary>Réservé aux comptes admin : tout <c>/api/admin</c> et le tableau de bord <c>/jobs</c>.</summary>
    public const string Admin = "Admin";
}

public static class Roles
{
    public const string Admin = "admin";
}

/// <summary>
/// Authentification par le cookie standard d'ASP.NET Core (§ 5.5 du plan v2). Le ticket ne porte que
/// le joueur et son appareil (<see cref="PlayerClaims"/>) ; à chaque requête, l'appareil est vérifié
/// en base et le rôle admin relu (<see cref="PlayerCookieEvents"/>, cache d'une minute). Les cookies
/// v1 sont repris par <see cref="LegacyCookieTransitionMiddleware"/>.
/// </summary>
public static class AuthSetup
{
    public const string Scheme = CookieAuthenticationDefaults.AuthenticationScheme;

    /// <summary>Durée de vie du cookie, glissante : renouvelé à l'usage.</summary>
    public static readonly TimeSpan CookieLifetime = TimeSpan.FromDays(90);

    /// <summary>Prod et staging : HTTPS derrière Cloudflare et Caddy. Développement et test : HTTP local.</summary>
    public static bool UsesSecureCookie(IHostEnvironment environment) =>
        environment.IsProduction() || environment.IsStaging();

    /// <summary>
    /// <c>__Host-</c> en prod et en staging : cookie limité à l'hôte de l'API, HTTPS seulement, sur
    /// tout le site. Le préfixe exige <c>Secure</c> : sans, en HTTP local.
    /// </summary>
    public static string CookieName(IHostEnvironment environment) =>
        UsesSecureCookie(environment) ? "__Host-inseconds" : "inseconds";

    public static IServiceCollection AddInSecondsAuth(this IServiceCollection services, IHostEnvironment environment)
    {
        var secure = UsesSecureCookie(environment);
        services.AddAuthentication(Scheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = CookieName(environment);
                options.Cookie.HttpOnly = true;
                options.Cookie.Path = "/";
                options.Cookie.SecurePolicy = secure ? CookieSecurePolicy.Always : CookieSecurePolicy.None;
                // Lax en prod et en staging (front et API same-site, piège 23), Strict en HTTP local.
                options.Cookie.SameSite = secure ? SameSiteMode.Lax : SameSiteMode.Strict;
                options.ExpireTimeSpan = CookieLifetime;
                options.SlidingExpiration = true;
                options.EventsType = typeof(PlayerCookieEvents);
            });
        services.AddScoped<PlayerCookieEvents>();
        services.AddScoped<DeviceSessionValidator>();
        services.AddSingleton<DeviceSessionStatusCache>();
        services.AddSingleton<IDeviceSessionValidationCache>(sp => sp.GetRequiredService<DeviceSessionStatusCache>());
        services.AddSingleton<TrustedOrigins>();
        services.AddSingleton<LegacyConversionCache>();

        services.AddAuthorizationBuilder()
            .AddPolicy(AuthorizationPolicies.Admin, policy => policy.RequireAuthenticatedUser().RequireRole(Roles.Admin));

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentPlayer, ClaimsCurrentPlayer>();
        services.AddScoped<IPlayerSignIn, PlayerSignIn>();

        // Jeton anti-CSRF des actions du tableau de bord Hangfire (S3), vérifié par Hangfire lui-même.
        services.AddAntiforgery();
        return services;
    }

    /// <summary>Juste après l'authentification : un cookie v1 devient un cookie v2 avant l'autorisation.</summary>
    public static IApplicationBuilder UseLegacyCookieTransition(this IApplicationBuilder app) =>
        app.UseMiddleware<LegacyCookieTransitionMiddleware>();
}
