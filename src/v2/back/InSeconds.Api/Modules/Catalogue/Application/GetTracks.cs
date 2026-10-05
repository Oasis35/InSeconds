using InSeconds.Api.Modules.Catalogue.Contracts;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Catalogue.Application;

public static class GetTracksEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/catalogue/tracks</c> : le pool, par artiste puis titre. Les morceaux, avec leur
    /// usage (Daily, par <see cref="ITrackUsage"/>) : dernier jour, nombre d'utilisations, fin du cooldown, présence
    /// dans le défi du jour. « Disponible » ou « utilisé » est au front de le déduire de <c>usageCount</c>.
    /// </summary>
    [WolverineGet("/api/admin/catalogue/tracks", OperationId = "listTracks")]
    public static async Task<IReadOnlyList<TrackListItem>> Get(
        ICatalogueQueries queries, ITrackUsage usage, IOptionsMonitor<CatalogueOptions> options, CancellationToken ct)
    {
        var rows = await queries.ListTracksAsync(ct);
        var usages = await usage.GetAsync([.. rows.Select(r => r.Id)], ct);
        var catalogue = options.CurrentValue;

        return
        [
            .. rows.Select(row =>
            {
                var used = usages.GetValueOrDefault(row.Id, TrackUsage.None);
                return new TrackListItem(
                    row.Id, row.DeezerTrackId, row.Artist, row.Title, catalogue.CoverUrl(row.CoverHash), row.ReleaseYear, row.DeezerRank,
                    TrackMapping.Name(row.PreviewStatus), row.PreviewCheckedAt, row.IsDisabled,
                    used.LastUsedDate, used.UsageCount, used.UnlockDate, used.InTodayChallenge);
            }),
        ];
    }
}
