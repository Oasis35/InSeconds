using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.RateLimiting;
using Wolverine;

namespace InSeconds.Api.Features.Sessions.StartSession;

public static class StartSessionEndpoint
{
    // enableRateLimiting=false en Testing (appelé par la quasi-totalité des tests
    // d'intégration/E2E qui démarrent une partie) — jamais désactivé en Dev/Production.
    public static IEndpointRouteBuilder MapStartSession(this IEndpointRouteBuilder routes, bool enableRateLimiting = true)
    {
        var route = routes.MapPost("/api/sessions", async (
            HttpContext httpContext,
            ICookieAuthService cookieAuth,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            // Seul point d'entrée qui crée un Player : démarrer une partie est le seul
            // événement qui justifie une ligne en base (cf. CLAUDE.md — pas de pollution
            // Players pour un simple chargement de page).
            var playerId = await cookieAuth.ResolveOrCreatePlayerAsync(httpContext, ct);
            return await bus.InvokeAsync<IResult>(new StartSessionCommand(playerId), ct);
        })
        .WithName("StartSession")
        .WithTags("Sessions")
        .Produces<StartSessionResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status409Conflict)
        .Produces(StatusCodes.Status503ServiceUnavailable)
        .Produces(StatusCodes.Status429TooManyRequests);

        if (enableRateLimiting)
            route.RequireRateLimiting(RateLimiterPolicies.PlayerCreation);

        return routes;
    }
}
