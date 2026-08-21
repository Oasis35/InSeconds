using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Players.GetCurrentPlayer;

public static class GetCurrentPlayerEndpoint
{
    public static IEndpointRouteBuilder MapGetCurrentPlayer(this IEndpointRouteBuilder app)
    {
        // Usage actuel : uniquement BrowserIdComponent (admin), pas le flow joueur —
        // on garde ici la création à la demande (ResolveOrCreatePlayerAsync) pour que
        // l'admin ait toujours un ID navigateur affiché, même s'il ne joue jamais.
        app.MapGet("/api/players/me", async (HttpContext ctx, ICookieAuthService cookieAuth, CancellationToken ct) =>
        {
            var playerId = await cookieAuth.ResolveOrCreatePlayerAsync(ctx, ct);
            return Results.Ok(new GetCurrentPlayerResponse(playerId));
        });

        return app;
    }
}

public sealed record GetCurrentPlayerResponse(Guid PlayerId);
