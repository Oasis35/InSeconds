using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

public sealed class EfCatalogueQueries(InSecondsDbContext db) : ICatalogueQueries
{
    public async Task<IReadOnlyList<TrackRow>> ListTracksAsync(CancellationToken ct) =>
        await db.Set<Track>().AsNoTracking()
            .OrderBy(t => t.Artist).ThenBy(t => t.Title).ThenBy(t => t.Id)
            .Select(t => new TrackRow(
                t.Id, t.DeezerTrackId, t.Artist, t.Title, t.CoverHash, t.ReleaseYear, t.DeezerRank,
                t.PreviewStatus, t.PreviewCheckedAt, t.DisabledAt != null))
            .ToListAsync(ct);
}

public sealed class EfTrackDirectory(InSecondsDbContext db, IOptionsMonitor<CatalogueOptions> options) : ITrackDirectory
{
    public async Task<IReadOnlyList<int>> ListPlayableIdsAsync(CancellationToken ct) =>
        await db.Set<Track>().AsNoTracking()
            .Where(t => t.DisabledAt == null && t.PreviewStatus == PreviewStatus.Available)
            .OrderBy(t => t.Id)
            .Select(t => t.Id)
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<int, TrackInfo>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var ids = trackIds.ToArray();
        var tracks = await db.Set<Track>().AsNoTracking()
            .Where(t => ids.Contains(t.Id))
            .Select(t => new { t.Id, t.DeezerTrackId, t.Artist, t.Title, t.CoverHash, t.ReleaseYear })
            .ToListAsync(ct);

        var catalogue = options.CurrentValue;
        return tracks.ToDictionary(
            t => t.Id,
            t => new TrackInfo(t.Id, t.DeezerTrackId, t.Artist, t.Title, TrackTitles.CleanDisplayTitle(t.Title), catalogue.CoverUrl(t.CoverHash), t.ReleaseYear));
    }
}
