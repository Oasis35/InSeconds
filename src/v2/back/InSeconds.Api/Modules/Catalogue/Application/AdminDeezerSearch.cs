using InSeconds.Deezer;
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
    /// <c>GET /api/admin/catalogue/deezer-search?q=</c> : la recherche du panneau d'ajout. Directement chez
    /// Deezer, sans cache ni nettoyage : les titres bruts sont ce qu'on ajoute au pool.
    /// </summary>
    [WolverineGet("/api/admin/catalogue/deezer-search", OperationId = "searchDeezer")]
    public static async Task<IReadOnlyList<DeezerTrackResult>> Get(
        string? q, ITrackSearch search, IOptionsMonitor<CatalogueOptions> options, CancellationToken ct)
    {
        if (!SearchTracksEndpoint.IsSearchable(q))
            return [];

        var catalogue = options.CurrentValue;
        var results = await search.SearchAsync(q, Limit, ct);
        return
        [
            .. results.Select(t => new DeezerTrackResult(
                t.DeezerTrackId, t.Artist, t.Title, t.PreviewUrl, catalogue.CoverUrl(t.CoverHash), t.ReleaseYear, t.Rank)),
        ];
    }
}
