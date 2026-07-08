using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Features.ChallengeGeneration;

namespace InSeconds.Api.Features.Admin.RefreshPreviews;

public static class RefreshPreviewsEndpoint
{
    public static IEndpointRouteBuilder MapRefreshPreviews(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/refresh-previews", async (
            PreviewStatusRefresher refresher,
            HttpContext ctx,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            var result = await refresher.RefreshAsync(ct);
            return Results.Ok(new RefreshPreviewsResponse(result.Checked, result.Updated, result.Failed));
        })
        .WithName("RefreshPreviews")
        .WithTags("Admin")
        .Produces<RefreshPreviewsResponse>(StatusCodes.Status200OK);

        return routes;
    }
}
