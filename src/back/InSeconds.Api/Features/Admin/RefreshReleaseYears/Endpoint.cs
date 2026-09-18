using InSeconds.Api.Common.Auth;
using InSeconds.Api.Features.ChallengeGeneration;

namespace InSeconds.Api.Features.Admin.RefreshReleaseYears;

public static class RefreshReleaseYearsEndpoint
{
    public static IEndpointRouteBuilder MapRefreshReleaseYears(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/refresh-release-years", async (
            ReleaseYearRefresher refresher,
            HttpContext ctx,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            var result = await refresher.RefreshAsync(ct);
            return Results.Ok(new RefreshReleaseYearsResponse(result.Checked, result.Updated, result.Failed));
        })
        .WithName("RefreshReleaseYears")
        .WithTags("Admin")
        .Produces<RefreshReleaseYearsResponse>(StatusCodes.Status200OK);

        return routes;
    }
}
