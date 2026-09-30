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
/// Authentification par le cookie standard d'ASP.NET Core (§ 5.5 du plan v2). Ce socle pose le schéma,
/// les réponses 401/403 et la policy Admin ; la PR B1 (Players) complète le cookie (nom <c>__Host-</c>,
/// durée, validation de l'appareil en base, rôle admin lu en base) et la connexion.
/// </summary>
public static class AuthSetup
{
    public static IServiceCollection AddInSecondsAuth(this IServiceCollection services)
    {
        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                // Une API répond 401/403, jamais une redirection HTML vers une page de connexion.
                options.Events.OnRedirectToLogin = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(AuthorizationPolicies.Admin, policy => policy.RequireAuthenticatedUser().RequireRole(Roles.Admin));

        // Jeton anti-CSRF des actions du tableau de bord Hangfire (S3), vérifié par Hangfire lui-même.
        services.AddAntiforgery();
        return services;
    }
}
