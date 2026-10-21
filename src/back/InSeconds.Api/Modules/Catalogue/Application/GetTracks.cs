using InSeconds.Api.Modules.Catalogue.Contracts;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

public static class GetTracksEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/catalogue/tracks</c> : le pool, par artiste puis titre. Chaque morceau porte ce que chaque mode de jeu en a fait
    /// (<see cref="ITrackPoolUsage"/>, mode par mode) et <c>isUsed</c> : « utilisé » est décidé ici, jamais déduit d'un compteur propre à un mode.
    /// </summary>
    [WolverineGet("/api/admin/catalogue/tracks", OperationId = "listTracks")]
    public static async Task<IReadOnlyList<TrackListItem>> Get(
        ICatalogueQueries queries, ITrackPoolUsage usage, IOptionsMonitor<CatalogueOptions> options, CancellationToken ct)
    {
        var rows = await queries.ListTracksAsync(ct);
        var usages = await usage.GetByModeAsync([.. rows.Select(r => r.Id)], ct);
        var catalogue = options.CurrentValue;

        return
        [
            .. rows.Select(row =>
            {
                var perMode = usages.GetValueOrDefault(row.Id) ?? [];
                return new TrackListItem(
                    row.Id, row.DeezerTrackId, row.Artist, row.Title, catalogue.CoverUrl(row.CoverHash), row.ReleaseYear, row.DeezerRank,
                    TrackMapping.Name(row.PreviewStatus), row.PreviewCheckedAt, row.IsDisabled,
                    perMode.Any(m => m.Usage.IsUsed),
                    [.. perMode.Select(m => new TrackModeUsage(m.Mode, m.Usage.UsageCount, m.Usage.LastUsedDate, m.Usage.UnlockDate, m.Usage.InTodayChallenge))],
                    row.Genres);
            }),
        ];
    }
}
