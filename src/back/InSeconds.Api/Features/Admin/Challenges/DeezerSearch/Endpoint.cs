using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Infrastructure.Deezer;

namespace InSeconds.Api.Features.Admin.Challenges.DeezerSearch;

public static class DeezerSearchEndpoint
{
    public static IEndpointRouteBuilder MapDeezerSearch(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/deezer-search", async (
            string q,
            HttpContext ctx,
            DeezerClient deezer,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
                return Results.Ok(Array.Empty<object>());

            var results = await deezer.SearchTracksAsync(q, ct);
            return Results.Ok(results);
        })
        .WithName("DeezerSearch")
        .WithTags("Admin")
        .Produces<IReadOnlyList<DeezerTrackInfo>>(StatusCodes.Status200OK);

        return routes;
    }
}
