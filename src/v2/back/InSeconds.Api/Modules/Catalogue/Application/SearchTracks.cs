using System.Diagnostics.CodeAnalysis;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Deezer;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Une suggestion de l'autocomplétion du jeu : jamais d'identifiant ni de pochette, rien qui désigne le morceau chez Deezer.</summary>
public sealed record TrackSuggestion(string Artist, string Title);

public static class SearchTracksEndpoint
{
    // On sur-demande à Deezer pour compenser les suggestions perdues à la déduplication (« Titre (Live) » et
    // « Titre (Radio Edit) » deviennent toutes deux « Titre »).
    internal const int FetchLimit = 20;
    internal const int ResultLimit = 10;
    internal const int MinQueryLength = 2;

    /// <summary>Au-delà, la requête n'est pas une saisie d'autocomplétion : liste vide, comme une requête trop courte, sans appeler Deezer.</summary>
    internal const int MaxQueryLength = 100;

    internal static bool IsSearchable([NotNullWhen(true)] string? q) =>
        q is not null && q.Length is >= MinQueryLength and <= MaxQueryLength && !string.IsNullOrWhiteSpace(q);

    /// <summary>
    /// <c>GET /api/catalogue/search?q=</c> : l'autocomplétion du jeu, publique (v1 : <c>/api/deezer/search</c>).
    /// Titres nettoyés et dédupliqués, dix au plus ; une requête trop courte (ou trop longue) donne une liste vide, Deezer indisponible aussi. Limitée par
    /// IP (60 / 5 min) : le quota Deezer est partagé par tous les joueurs, et le cache d'une heure ne protège
    /// pas d'un script qui varie sa requête à chaque appel.
    /// </summary>
    [WolverineGet("/api/catalogue/search", OperationId = "searchTracks")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    [EnableRateLimiting(RateLimitPolicies.CatalogueSearch)]
    public static async Task<IReadOnlyList<TrackSuggestion>> Get(string? q, CachedTrackSearch search, CancellationToken ct)
    {
        if (!IsSearchable(q))
            return [];

        // Deezer indisponible : l'autocomplétion se tait simplement, le joueur peut toujours taper sa réponse.
        return await search.SearchAsync(q, FetchLimit, ct) is SearchLookup.Found found
            ? CleanAndDeduplicate(found.Tracks)
            : [];
    }

    /// <summary>
    /// Nettoie le titre (<see cref="TrackTitles.CleanDisplayTitle"/>) puis déduplique sur (artiste, titre
    /// nettoyé) sans tenir compte de la casse, en gardant la première occurrence : l'ordre de Deezer reflète
    /// déjà la pertinence.
    /// </summary>
    internal static IReadOnlyList<TrackSuggestion> CleanAndDeduplicate(IReadOnlyList<DeezerTrack> tracks)
    {
        var seen = new HashSet<(string Artist, string Title)>();
        var results = new List<TrackSuggestion>();

        foreach (var track in tracks)
        {
            var title = TrackTitles.CleanDisplayTitle(track.Title);
            if (!seen.Add((track.Artist.ToLowerInvariant(), title.ToLowerInvariant())))
                continue;

            results.Add(new TrackSuggestion(track.Artist, title));
            if (results.Count == ResultLimit)
                break;
        }

        return results;
    }
}
