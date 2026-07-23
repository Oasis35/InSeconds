using System.Text.RegularExpressions;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Infrastructure.Deezer;

namespace InSeconds.Api.Features.Deezer;

public static class SearchEndpoint
{
    // On sur-demande à Deezer pour compenser les suggestions perdues à la déduplication
    // (ex: "Titre (Live)" et "Titre (Radio Edit)" deviennent toutes deux "Titre").
    private const int FetchLimit = 20;
    private const int ResultLimit = 10;

    public static IEndpointRouteBuilder MapDeezerSearchPublic(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/deezer/search", async (string q, CachedDeezerClient deezer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
                return Results.Ok(Array.Empty<DeezerSearchResult>());

            var tracks = await deezer.SearchTracksAsync(q, ct, FetchLimit);
            var results = CleanAndDeduplicate(tracks);
            return Results.Ok(results);
        });

        return app;
    }

    // Retire les parenthèses/crochets du titre (même règle que TextNormalizer côté correction
    // des réponses) puis déduplique sur (Artiste, Titre nettoyé) en gardant la première occurrence
    // (l'ordre Deezer reflète déjà la pertinence).
    internal static IReadOnlyList<DeezerSearchResult> CleanAndDeduplicate(IReadOnlyList<DeezerTrackInfo> tracks)
    {
        var seen = new HashSet<(string Artist, string Title)>();
        var results = new List<DeezerSearchResult>();

        foreach (var track in tracks)
        {
            var cleanedTitle = CleanTitle(track.Title);
            var key = (track.Artist.ToLowerInvariant(), cleanedTitle.ToLowerInvariant());

            if (!seen.Add(key))
                continue;

            results.Add(new DeezerSearchResult(track.Artist, cleanedTitle));
            if (results.Count == ResultLimit)
                break;
        }

        return results;
    }

    internal static string CleanTitle(string title)
    {
        var cleaned = TextNormalizationHelpers.ParenthesesPattern().Replace(title, "");
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();

        // Titre entièrement entre parenthèses (rare) : garder l'original plutôt qu'une chaîne vide.
        return cleaned.Length == 0 ? title : cleaned;
    }
}

public sealed record DeezerSearchResult(string Artist, string Title);
