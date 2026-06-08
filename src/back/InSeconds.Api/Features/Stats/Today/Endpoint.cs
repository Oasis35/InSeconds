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
            // PlayerId peut être absent si le middleware n'a pas résolu (ne devrait pas arriver)
            Guid? playerId = httpContext.Items.TryGetValue(PlayerHttpContextExtensions.PlayerIdKey, out var val) && val is Guid id
                ? id
                : null;

            return await handler.Handle(playerId, ct);
        })
        .WithName("TodayStats")
        .WithTags("Stats")
        .Produces<TodayStatsResponse>(StatusCodes.Status200OK);

        return routes;
    }
}
