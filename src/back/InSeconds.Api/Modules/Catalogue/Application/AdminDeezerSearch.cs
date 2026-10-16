using InSeconds.Deezer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Un résultat de la recherche admin : les titres sont ceux de Deezer, bruts (ils deviennent <c>Track.Title</c> à l'ajout).</summary>
/// <param name="PreviewUrl">Extrait de 30 s à écouter avant d'ajouter ; vide si Deezer n'en a pas.</param>
public sealed record DeezerTrackResult(
    long DeezerTrackId, string Artist, string Title, string? PreviewUrl, string? CoverUrl, int? ReleaseYear, int? Rank);

public static class AdminDeezerSearchEndpoint
{
    private const int Limit = 10;

    /// <summary>
    /// Ce que Deezer a répondu. Une requête trop courte ou trop longue n'appelle pas Deezer : aucun résultat.
    /// </summary>
    public static async Task<SearchLookup> LoadAsync(string? q, ITrackSearch search, CancellationToken ct) =>
        SearchTracksEndpoint.IsSearchable(q)
            ? await search.SearchAsync(q, Limit, ct)
            : new SearchLookup.Found([]);

    public static ProblemDetails Validate(SearchLookup lookup) =>
        lookup is SearchLookup.Unavailable ? CatalogueProblems.DeezerUnavailable() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/admin/catalogue/deezer-search?q=</c> : la recherche du panneau d'ajout. Directement chez
    /// Deezer, sans cache ni nettoyage : les titres bruts sont ce qu'on ajoute au pool. Deezer en panne ou
    /// quota dépassé : 503 <c>catalogue.deezer_unavailable</c>, pour que l'écran ne confonde pas avec
    /// « aucun résultat ».
    /// </summary>
    [WolverineGet("/api/admin/catalogue/deezer-search", OperationId = "searchDeezer")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public static IReadOnlyList<DeezerTrackResult> Get(SearchLookup lookup, IOptionsMonitor<CatalogueOptions> options)
    {
        var catalogue = options.CurrentValue;
        return
        [
            .. ((SearchLookup.Found)lookup).Tracks.Select(t => new DeezerTrackResult(
                t.DeezerTrackId, t.Artist, t.Title, t.PreviewUrl, catalogue.CoverUrl(t.CoverHash), t.ReleaseYear, t.Rank)),
        ];
    }
}
