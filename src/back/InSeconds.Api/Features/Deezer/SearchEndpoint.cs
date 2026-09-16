using InSeconds.Api.Common.Text;
using InSeconds.Deezer;

namespace InSeconds.Api.Features.Deezer;

public static class SearchEndpoint
{
    // On sur-demande à Deezer pour compenser les suggestions perdues à la déduplication
    // (ex: "Titre (Live)" et "Titre (Radio Edit)" deviennent toutes deux "Titre").
    private const int FetchLimit = 20;
    private const int ResultLimit = 10;

    public const string RateLimiterPolicy = "deezer-search-public";

    // enableRateLimiting=false en Testing (autocomplete appelée abondamment par les tests
    // d'intégration/E2E dédiés + par tout parcours de jeu simulé) — jamais désactivé en
    // Dev/Production. Le CachedDeezerClient (TTL 1h) atténue déjà les requêtes identiques
    // répétées mais ne protège pas contre une requête qui varie la query à chaque appel
    // (script qui martèle l'API Deezer via notre proxy, épuisant le quota partagé par tous
    // les joueurs) — d'où ce rate limit par IP en complément, volontairement généreux pour ne
    // jamais gêner un joueur qui tape/corrige sa recherche normalement (autocomplete debounce
    // 300ms côté front, plusieurs requêtes par recherche tapée sont normales).
    public static IEndpointRouteBuilder MapDeezerSearchPublic(this IEndpointRouteBuilder app, bool enableRateLimiting = true)
    {
        var route = app.MapGet("/api/deezer/search", async (string q, CachedDeezerClient deezer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
                return Results.Ok(Array.Empty<DeezerSearchResult>());

            var tracks = await deezer.SearchTracksAsync(q, ct, FetchLimit);
            var results = CleanAndDeduplicate(tracks);
            return Results.Ok(results);
        })
        .Produces(StatusCodes.Status429TooManyRequests);

        if (enableRateLimiting)
            route.RequireRateLimiting(RateLimiterPolicy);

        return app;
    }

    // Nettoie le titre (TextNormalizationHelpers.CleanDisplayTitle) puis déduplique sur
    // (Artiste, Titre nettoyé) en gardant la première occurrence (l'ordre Deezer reflète
    // déjà la pertinence).
    internal static IReadOnlyList<DeezerSearchResult> CleanAndDeduplicate(IReadOnlyList<DeezerTrackInfo> tracks)
    {
        var seen = new HashSet<(string Artist, string Title)>();
        var results = new List<DeezerSearchResult>();

        foreach (var track in tracks)
        {
            var cleanedTitle = TextNormalizationHelpers.CleanDisplayTitle(track.Title);
            var key = (track.Artist.ToLowerInvariant(), cleanedTitle.ToLowerInvariant());

            if (!seen.Add(key))
                continue;

            results.Add(new DeezerSearchResult(track.Artist, cleanedTitle));
            if (results.Count == ResultLimit)
                break;
        }

        return results;
    }
}

public sealed record DeezerSearchResult(string Artist, string Title);
