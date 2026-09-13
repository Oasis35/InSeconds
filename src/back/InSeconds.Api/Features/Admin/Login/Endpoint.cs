using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Admin.Login;

public static class LoginEndpoint
{
    public const string LoginRateLimiterPolicy = "admin-login";
    private const string BearerPrefix = "Bearer ";

    // enableRateLimiting=false en Testing (E2E/intégration font ~20 appels de login réels
    // sur la suite complète, potentiellement en quelques secondes) — jamais désactivé en
    // Dev/Production, où c'est la seule protection anti brute-force sur ce mot de passe unique.
    public static IEndpointRouteBuilder MapAdminLogin(this IEndpointRouteBuilder routes, bool enableRateLimiting = true)
    {
        var loginRoute = routes.MapPost("/api/admin/login", async (LoginBody body, IMessageBus bus, CancellationToken ct) =>
            await bus.InvokeAsync<IResult>(new LoginCommand(body.Password), ct))
        .WithName("AdminLogin")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status429TooManyRequests);

        if (enableRateLimiting)
            loginRoute.RequireRateLimiting(LoginRateLimiterPolicy);

        // Révoque réellement le jeton côté serveur (cf. IAdminTokenStore) — avant, ce endpoint
        // ne faisait rien : le token statique n'avait de toute façon rien à invalider.
        routes.MapPost("/api/admin/logout", (HttpContext ctx, IAdminTokenStore adminTokens) =>
        {
            if (TryGetBearerToken(ctx, out var token))
                adminTokens.Revoke(token);

            return Results.Ok();
        })
        .WithName("AdminLogout")
        .WithTags("Admin");

        routes.MapGet("/api/admin/me", (HttpContext ctx) =>
            IsAdminAuthenticated(ctx) ? Results.Ok() : Results.Unauthorized())
        .WithName("AdminMe")
        .WithTags("Admin");

        return routes;
    }

    public static bool IsAdminAuthenticated(HttpContext ctx)
    {
        if (!TryGetBearerToken(ctx, out var token))
            return false;

        var adminTokens = ctx.RequestServices.GetRequiredService<IAdminTokenStore>();
        if (!adminTokens.IsValid(token))
            return false;

        var configuration = ctx.RequestServices.GetRequiredService<IConfiguration>();
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        return OriginValidator.IsTrustedOrigin(ctx, allowedOrigins);
    }

    private static bool TryGetBearerToken(HttpContext ctx, out string token)
    {
        var auth = ctx.Request.Headers.Authorization.ToString();
        if (auth.StartsWith(BearerPrefix, StringComparison.Ordinal))
        {
            token = auth[BearerPrefix.Length..];
            return true;
        }

        token = "";
        return false;
    }
}

public sealed record LoginBody(string Password);
