namespace InSeconds.Api.Common.Auth;

public sealed class PlayerAuthMiddleware(RequestDelegate next, IHostEnvironment env)
{
    private const string TestingBypassToken = "admin-token";
    private const string BearerPrefix = "Bearer ";

    public async Task InvokeAsync(HttpContext httpContext, ICookieAuthService cookieAuth)
    {
        if (!httpContext.Request.Path.StartsWithSegments("/health"))
        {
            // Ne crée jamais de Player ici : un visiteur qui n'a jamais démarré de partie
            // (settings, autocomplete, stats/today...) ne doit pas polluer la table Players.
            // La création reste à la charge des endpoints qui en ont vraiment besoin
            // (StartSession, GetCurrentPlayer) via ICookieAuthService.ResolveOrCreatePlayerAsync.
            // Résolu aussi sur /api/admin : l'accès admin est désormais un rôle sur ce même
            // cookie joueur (Player.IsAdmin), plus un mécanisme séparé.
            var resolution = await cookieAuth.TryResolvePlayerAsync(httpContext);
            if (resolution is not null)
            {
                httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey] = resolution.PlayerId;
                httpContext.Items[PlayerHttpContextExtensions.IsAdminKey] = resolution.IsAdmin;
                if (resolution.Pseudo is not null)
                    httpContext.Items[PlayerHttpContextExtensions.PseudoKey] = resolution.Pseudo;
            }

            // Bypass Testing uniquement : les tests d'intégration/E2E forgent directement
            // "Authorization: Bearer admin-token" sans passer par un vrai compte IsAdmin=true
            // (IntegrationTestFactory, e2e/fixtures/api-client.ts, e2e/pages/admin.page.ts).
            // Double garde : jamais atteignable hors Testing.
            if (env.IsEnvironment("Testing") && HasTestingAdminBearer(httpContext))
                httpContext.Items[PlayerHttpContextExtensions.IsAdminKey] = true;
        }

        await next(httpContext);
    }

    private static bool HasTestingAdminBearer(HttpContext httpContext) =>
        httpContext.Request.Headers.Authorization.ToString() == BearerPrefix + TestingBypassToken;
}
