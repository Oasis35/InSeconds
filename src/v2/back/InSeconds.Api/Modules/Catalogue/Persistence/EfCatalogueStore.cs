using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

public sealed class EfCatalogueStore(InSecondsDbContext db) : ICatalogueStore
{
    // AddAsync : la séquence de l'identifiant (HiLo) est lue au besoin, l'identifiant est connu tout de suite.
    public async ValueTask AddAsync(Track track, CancellationToken ct) => await db.AddAsync(track, ct);

    public void Remove(Track track) => db.Remove(track);

    public Task<Track?> FindAsync(int id, CancellationToken ct) =>
        db.Set<Track>().FirstOrDefaultAsync(t => t.Id == id, ct);

    public Task<bool> DeezerIdTakenAsync(long deezerTrackId, int? exceptTrackId, CancellationToken ct) =>
        db.Set<Track>().AnyAsync(t => t.DeezerTrackId == deezerTrackId && t.Id != exceptTrackId, ct);

    public async Task<IReadOnlyList<Track>> ListRefreshCandidatesAsync(IReadOnlyCollection<int> excludedTrackIds, CancellationToken ct)
    {
        var excluded = excludedTrackIds.ToArray();
        return await db.Set<Track>()
            .Where(t => t.DisabledAt == null && !excluded.Contains(t.Id))
            .OrderBy(t => t.Id)
            .AsNoTracking()
            .ToListAsync(ct);
    }

    // Une requête par morceau (ExecuteUpdate, validée tout de suite) : pas de transaction ouverte pendant les pauses du
    // contrôle, et une ligne supprimée entre-temps (0 ligne touchée) ne fait perdre aucun autre résultat.
    public async Task<IReadOnlySet<int>> SaveRefreshedAsync(IReadOnlyCollection<Track> tracks, CancellationToken ct)
    {
        var saved = new HashSet<int>();
        foreach (var track in tracks)
        {
            var status = track.PreviewStatus;
            var checkedAt = track.PreviewCheckedAt;
            var rank = track.DeezerRank;
            var rankAt = track.RankUpdatedAt;
            var updatedAt = track.UpdatedAt;
            var rows = await db.Set<Track>().Where(t => t.Id == track.Id).ExecuteUpdateAsync(s => s
                .SetProperty(t => t.PreviewStatus, status)
                .SetProperty(t => t.PreviewCheckedAt, checkedAt)
                .SetProperty(t => t.DeezerRank, rank)
                .SetProperty(t => t.RankUpdatedAt, rankAt)
                .SetProperty(t => t.UpdatedAt, updatedAt), ct);
            if (rows > 0)
                saved.Add(track.Id);
        }

        return saved;
    }
}
