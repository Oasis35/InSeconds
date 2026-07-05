using InSeconds.Api.Infrastructure.Deezer;

namespace InSeconds.Api.Features.Deezer;

public static class SearchEndpoint
{
    public static IEndpointRouteBuilder MapDeezerSearchPublic(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/deezer/search", async (string q, CachedDeezerClient deezer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
                return Results.Ok(Array.Empty<DeezerSearchResult>());

            var tracks = await deezer.SearchTracksAsync(q, ct);
            var results = tracks.Select(t => new DeezerSearchResult(t.Artist, t.Title));
            return Results.Ok(results);
        });

        return app;
    }
}

public sealed record DeezerSearchResult(string Artist, string Title);
