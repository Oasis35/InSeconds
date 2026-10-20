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

    public async Task<IReadOnlyList<Track>> ListRefreshCandidatesAsync(CancellationToken ct) =>
        await db.Set<Track>()
            .Where(t => t.DisabledAt == null)
            .OrderBy(t => t.Id)
            .AsNoTracking()
            .ToListAsync(ct);

    // Les genres sont écrits en SQL, avec « ON CONFLICT » : deux ajouts simultanés de morceaux qui partagent un genre neuf (ou le contrôle
    // nocturne en même temps) ne se heurtent jamais sur la clé du genre, le second attend le premier au lieu d'échouer. Les lignes lues
    // ensuite ne sont que référencées par la jonction du morceau.
    public async Task<IReadOnlyList<Genre>> EnsureGenresAsync(IReadOnlyCollection<GenreRef> genres, CancellationToken ct)
    {
        var wanted = genres.DistinctBy(g => g.Id).ToList();
        if (wanted.Count == 0)
            return [];

        foreach (var genre in wanted)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO catalogue.genres (id, name) VALUES ({genre.Id}, {genre.Name}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name", ct);
        }

        var ids = wanted.Select(g => g.Id).ToArray();
        return await db.Set<Genre>().Where(g => ids.Contains(g.Id)).OrderBy(g => g.Id).ToListAsync(ct);
    }

    // En SQL et dans sa propre transaction : le contrôle nocturne n'est pas transactionnel (NonTransactional) et ne passe jamais par
    // SaveChanges. Les genres de tous les morceaux de l'album sont remplacés d'un coup, jamais à moitié.
    public async Task SaveAlbumGenresAsync(long albumId, IReadOnlyCollection<GenreRef> genres, DateTimeOffset now, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        foreach (var genre in genres)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO catalogue.genres (id, name) VALUES ({genre.Id}, {genre.Name}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name", ct);
        }

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"DELETE FROM catalogue.track_genres WHERE track_id IN (SELECT id FROM catalogue.tracks WHERE album_id = {albumId})", ct);
        foreach (var genre in genres)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO catalogue.track_genres (track_id, genre_id) SELECT id, {genre.Id} FROM catalogue.tracks WHERE album_id = {albumId}", ct);
        }

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE catalogue.tracks SET genres_checked_at = {now} WHERE album_id = {albumId}", ct);
        await transaction.CommitAsync(ct);
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
            var albumId = track.AlbumId;
            var genresCheckedAt = track.GenresCheckedAt;
            var updatedAt = track.UpdatedAt;
            var rows = await db.Set<Track>().Where(t => t.Id == track.Id).ExecuteUpdateAsync(s => s
                .SetProperty(t => t.PreviewStatus, status)
                .SetProperty(t => t.PreviewCheckedAt, checkedAt)
                .SetProperty(t => t.DeezerRank, rank)
                .SetProperty(t => t.RankUpdatedAt, rankAt)
                .SetProperty(t => t.AlbumId, albumId)
                .SetProperty(t => t.GenresCheckedAt, genresCheckedAt)
                .SetProperty(t => t.UpdatedAt, updatedAt), ct);
            if (rows > 0)
                saved.Add(track.Id);
        }

        return saved;
    }
}
