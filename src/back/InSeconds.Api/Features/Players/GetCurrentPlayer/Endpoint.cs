using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Players.GetCurrentPlayer;

public static class GetCurrentPlayerEndpoint
{
    public static IEndpointRouteBuilder MapGetCurrentPlayer(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/players/me", (HttpContext ctx) =>
            Results.Ok(new GetCurrentPlayerResponse(ctx.GetPlayerId())));

        return app;
    }
}

public sealed record GetCurrentPlayerResponse(Guid PlayerId);
