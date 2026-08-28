using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Sessions.GetTodaySession;

public static class GetTodaySessionEndpoint
{
    public static IEndpointRouteBuilder MapGetTodaySession(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/sessions/today", async (
            HttpContext httpContext,
            GetTodaySessionHandler handler,
            CancellationToken ct) =>
        {
            // PlayerId absent = visiteur sans cookie / n'ayant jamais démarré de partie.
            // Le peek ne crée jamais de Player (contrairement à POST /api/sessions).
            var playerId = httpContext.GetPlayerIdOrNull();
            return Results.Ok(await handler.Handle(playerId, ct));
        })
        .WithName("GetTodaySession")
        .WithTags("Sessions")
        .Produces<GetTodaySessionResponse>(StatusCodes.Status200OK);

        return routes;
    }
}
