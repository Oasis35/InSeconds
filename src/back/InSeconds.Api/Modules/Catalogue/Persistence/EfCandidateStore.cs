using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

public sealed class EfCandidateStore(InSecondsDbContext db) : ICandidateStore
{
    public async ValueTask AddCandidateAsync(Candidate candidate, CancellationToken ct) => await db.AddAsync(candidate, ct);

    public void RemoveCandidate(Candidate candidate) => db.Remove(candidate);

    public Task<Candidate?> FindCandidateAsync(int id, CancellationToken ct) => db.Set<Candidate>().FirstOrDefaultAsync(c => c.Id == id, ct);

    public async Task<IReadOnlyList<Candidate>> FindCandidatesAsync(IReadOnlyCollection<int> ids, CancellationToken ct) =>
        await db.Set<Candidate>().Where(c => ids.Contains(c.Id)).OrderBy(c => c.Id).ToListAsync(ct);

    public async Task<IReadOnlyList<Candidate>> FindCandidatesByDeezerIdsAsync(IReadOnlyCollection<long> deezerTrackIds, CancellationToken ct) =>
        await db.Set<Candidate>().Where(c => deezerTrackIds.Contains(c.DeezerTrackId)).ToListAsync(ct);

    public async Task<IReadOnlyList<int>> ListPendingCandidateIdsAsync(CancellationToken ct) =>
        await db.Set<Candidate>().AsNoTracking()
            .Where(c => c.Status == CandidateStatus.Pending && c.DismissedAt == null)
            .OrderBy(c => c.Id).Select(c => c.Id).ToListAsync(ct);

    public async Task<IReadOnlyList<Candidate>> ListCandidatesToReadAsync(IReadOnlyCollection<int> ids, CancellationToken ct) =>
        await db.Set<Candidate>().AsNoTracking().Where(c => ids.Contains(c.Id) && c.Status == CandidateStatus.Pending).OrderBy(c => c.Id).ToListAsync(ct);

    // Une requête par candidat (ExecuteUpdate) : jamais la transaction d'un handler, la lecture de Deezer dure plusieurs secondes.
    public async Task SaveCandidateReadsAsync(IReadOnlyCollection<Candidate> candidates, CancellationToken ct)
    {
        foreach (var candidate in candidates)
        {
            var status = candidate.Status;
            var artist = candidate.Artist;
            var title = candidate.Title;
            var coverHash = candidate.CoverHash;
            var year = candidate.ReleaseYear;
            var rank = candidate.Rank;
            var preview = candidate.PreviewStatus;
            var albumId = candidate.AlbumId;
            var readAt = candidate.ReadAt;
            await db.Set<Candidate>().Where(c => c.Id == candidate.Id).ExecuteUpdateAsync(s => s
                .SetProperty(c => c.Status, status)
                .SetProperty(c => c.Artist, artist)
                .SetProperty(c => c.Title, title)
                .SetProperty(c => c.CoverHash, coverHash)
                .SetProperty(c => c.ReleaseYear, year)
                .SetProperty(c => c.Rank, rank)
                .SetProperty(c => c.PreviewStatus, preview)
                .SetProperty(c => c.AlbumId, albumId)
                .SetProperty(c => c.ReadAt, readAt), ct);
        }
    }
}
