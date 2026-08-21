using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Stats.Today;

public static class TodayStatsEndpoint
{
    public static IEndpointRouteBuilder MapTodayStats(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/stats/today", async (
            HttpContext httpContext,
            TodayStatsHandler handler,
            CancellationToken ct) =>
        {
            // PlayerId absent = visiteur n'ayant jamais démarré de partie (pas de Player créé)
            var playerId = httpContext.GetPlayerIdOrNull();

            return await handler.Handle(playerId, ct);
        })
        .WithName("TodayStats")
        .WithTags("Stats")
        .Produces<TodayStatsResponse>(StatusCodes.Status200OK);

        return routes;
    }
}
