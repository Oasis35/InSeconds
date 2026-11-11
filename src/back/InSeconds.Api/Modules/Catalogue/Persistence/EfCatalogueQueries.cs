using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

public sealed class EfCatalogueQueries(InSecondsDbContext db, TimeProvider time) : ICatalogueQueries
{
    public async Task<IReadOnlyList<TrackRow>> ListTracksAsync(CancellationToken ct) =>
        await db.Set<Track>().AsNoTracking()
            .OrderBy(t => t.Artist).ThenBy(t => t.Title).ThenBy(t => t.Id)
            .Select(t => new TrackRow(
                t.Id, t.DeezerTrackId, t.Artist, t.Title, t.CoverHash, t.ReleaseYear, t.DeezerRank,
                t.PreviewStatus, t.PreviewCheckedAt, t.DisabledAt != null,
                t.Genres.OrderBy(g => g.Name).Select(g => g.Name).ToList(), t.Themes.OrderBy(x => x.Id).Select(x => x.Id).ToList(), t.AltTitles))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<ThemeItem>> ListThemesAsync(CancellationToken ct) =>
        await db.Set<Theme>().AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new ThemeItem(t.Id, t.Name, db.Set<Track>().Count(track => track.Themes.Any(x => x.Id == t.Id)), t.Icon))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<CandidateItem>> ListCandidatesAsync(CancellationToken ct)
    {
        var rows = await db.Set<Candidate>().AsNoTracking()
            .OrderBy(c => c.Id)
            .Select(c => new
            {
                c.Id,
                c.DeezerTrackId,
                c.Priority,
                c.Status,
                c.Artist,
                c.Title,
                c.ReleaseYear,
                c.Rank,
                c.PreviewStatus,
                InCatalogue = db.Set<Track>().Any(t => t.DeezerTrackId == c.DeezerTrackId),
                IsDismissed = c.DismissedAt != null,
                AddRequestedAt = c.AddRequestedAt,
            })
            .ToListAsync(ct);
        var now = time.GetUtcNow();
        return
        [
            .. rows.Select(r => new CandidateItem(
                r.Id, r.DeezerTrackId, r.Priority, CandidateStatusName(r.Status), r.Artist, r.Title, r.ReleaseYear, r.Rank,
                TrackMapping.Name(r.PreviewStatus), r.InCatalogue, r.IsDismissed, Candidate.IsAddingAt(r.AddRequestedAt, now))),
        ];
    }

    private static string CandidateStatusName(CandidateStatus status) => status switch
    {
        CandidateStatus.Ready => "ready",
        CandidateStatus.NotFound => "not_found",
        _ => "pending",
    };

    public async Task<CatalogueHealthResponse> GetHealthAsync(CancellationToken ct)
    {
        var active = db.Set<Track>().AsNoTracking().Where(t => t.DisabledAt == null);
        var missingPreview = await active.CountAsync(t => t.PreviewStatus == PreviewStatus.Missing, ct);
        var missingWaveform = await active.CountAsync(t => t.PreviewStatus == PreviewStatus.Available && t.Waveform == null, ct);
        return new CatalogueHealthResponse(missingPreview, missingWaveform);
    }
}

public sealed class EfTrackDirectory(InSecondsDbContext db, IOptionsMonitor<CatalogueOptions> options) : ITrackDirectory
{
    public async Task<IReadOnlyList<int>> ListPlayableIdsAsync(CancellationToken ct) =>
        await db.Set<Track>().AsNoTracking()
            .Where(t => t.DisabledAt == null && t.PreviewStatus == PreviewStatus.Available)
            .OrderBy(t => t.Id)
            .Select(t => t.Id)
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<int, string>> ListThemesAsync(CancellationToken ct) =>
        await db.Set<Theme>().AsNoTracking().ToDictionaryAsync(t => t.Id, t => t.Name, ct);

    public async Task<IReadOnlyDictionary<int, string>> ListThemeIconsAsync(CancellationToken ct) =>
        await db.Set<Theme>().AsNoTracking().Where(t => t.Icon != null).ToDictionaryAsync(t => t.Id, t => t.Icon!, ct);

    public async Task<IReadOnlyDictionary<int, TrackInfo>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var ids = trackIds.ToArray();
        var tracks = await db.Set<Track>().AsNoTracking()
            .Where(t => ids.Contains(t.Id))
            .Select(t => new
            {
                t.Id,
                t.DeezerTrackId,
                t.Artist,
                t.Title,
                t.CoverHash,
                t.ReleaseYear,
                t.DeezerRank,
                t.AltTitles,
                ThemeIds = t.Themes.OrderBy(x => x.Id).Select(x => x.Id).ToList(),
                Genres = t.Genres.OrderBy(g => g.Name).Select(g => g.Name).ToList(),
            })
            .ToListAsync(ct);

        var catalogue = options.CurrentValue;
        return tracks.ToDictionary(
            t => t.Id,
            t => new TrackInfo(t.Id, t.DeezerTrackId, t.Artist, t.Title, TrackTitles.CleanDisplayTitle(t.Title), catalogue.CoverUrl(t.CoverHash), t.ReleaseYear, t.DeezerRank, t.Genres, t.ThemeIds, t.AltTitles));
    }
}
