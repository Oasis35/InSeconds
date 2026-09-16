using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Admin.Tracks.GetTracks;

public static class GetTracksEndpoint
{
    public static IEndpointRouteBuilder MapGetTracks(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/tracks", async (
            HttpContext ctx,
            GetTracksHandler handler,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            return await handler.Handle(ct);
        })
        .WithName("GetTracks")
        .WithTags("Admin")
        .Produces<GetTracksResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }
}
