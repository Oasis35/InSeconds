using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

public sealed class EfCatalogueStore(InSecondsDbContext db) : ICatalogueStore
{
    // AddAsync : la séquence de l'identifiant (HiLo) est lue au besoin, l'identifiant est connu tout de suite.
    public async ValueTask AddAsync(Track track, CancellationToken ct) => await db.AddAsync(track, ct);

    public void Remove(Track track) => db.Remove(track);

    public Task<Track?> FindAsync(int id, CancellationToken ct) =>
        db.Set<Track>().FirstOrDefaultAsync(t => t.Id == id, ct);

    // Les genres chargés : les remplacer (ou les vider) supprime les lignes de track_genres à l'enregistrement.
    public Task<Track?> FindWithGenresAsync(int id, CancellationToken ct) =>
        db.Set<Track>().Include(t => t.Genres).FirstOrDefaultAsync(t => t.Id == id, ct);

    public Task<bool> DeezerIdTakenAsync(long deezerTrackId, int? exceptTrackId, CancellationToken ct) =>
        db.Set<Track>().AnyAsync(t => t.DeezerTrackId == deezerTrackId && t.Id != exceptTrackId, ct);

    public async Task<IReadOnlyList<Track>> ListRefreshCandidatesAsync(CancellationToken ct) =>
        await db.Set<Track>()
            .Where(t => t.DisabledAt == null)
            .OrderBy(t => t.Id)
            .AsNoTracking()
            .ToListAsync(ct);

    // Un genre déjà là est repris (son nom suit Deezer), les autres sont ajoutés : enregistrés avec le morceau, par la transaction du handler.
    // Deux ajouts simultanés qui partagent un genre neuf se heurtent sur sa clé : le second est refusé à l'enregistrement
    // (TrackConflictExceptionHandler, 409) ; la transaction de Wolverine est alors annulée, une nouvelle tentative n'y serait pas possible.
    public async Task<IReadOnlyList<Genre>> EnsureGenresAsync(IReadOnlyCollection<GenreRef> genres, CancellationToken ct)
    {
        var wanted = genres.DistinctBy(g => g.Id).ToList();
        if (wanted.Count == 0)
            return [];

        var ids = wanted.Select(g => g.Id).ToArray();
        var known = await db.Set<Genre>().Where(g => ids.Contains(g.Id)).ToDictionaryAsync(g => g.Id, ct);

        var result = new List<Genre>(wanted.Count);
        foreach (var reference in wanted)
        {
            if (known.TryGetValue(reference.Id, out var existing))
            {
                if (existing.Name != reference.Name)
                    existing.Rename(reference.Name);
                result.Add(existing);
            }
            else
            {
                var created = new Genre(reference.Id, reference.Name);
                db.Add(created);
                result.Add(created);
            }
        }

        return result;
    }

    // Le contrôle nocturne n'est pas transactionnel (NonTransactional) : cette méthode enregistre elle-même, un album à la fois (c'est l'une
    // des exceptions de SaveChanges, cf. HandlerRulesTests). Les genres de tous les morceaux de l'album sont remplacés d'un coup, jamais à moitié.
    // Un ajout simultané peut écrire le même genre neuf avant nous : l'enregistrement est refusé sur sa clé, on recommence une fois (le genre
    // existe alors). Le contexte est vidé à chaque album : le contrôle en traite des centaines.
    public async Task SaveAlbumGenresAsync(long albumId, IReadOnlyCollection<GenreRef> genres, DateTimeOffset now, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                var entities = await EnsureGenresAsync(genres, ct);
                var tracks = await db.Set<Track>().Include(t => t.Genres).Where(t => t.AlbumId == albumId).ToListAsync(ct);
                foreach (var track in tracks)
                    track.RecordGenres(entities, now);
                await db.SaveChangesAsync(ct);
                return;
            }
            catch (DbUpdateException ex) when (attempt == 1 && ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                // Recommence : la ligne du genre est maintenant en base.
            }
            finally
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    // Une requête par morceau (ExecuteUpdate, validée tout de suite) : pas de transaction ouverte pendant les pauses du
    // contrôle, et une ligne supprimée entre-temps (0 ligne touchée) ne fait perdre aucun autre résultat.
    // Les morceaux lus sans leurs genres, vider la liste ne supprime rien : un morceau dont les genres sont à relire (il a changé
    // d'album) perd ici ses lignes de track_genres, celles de l'ancien album, sans attendre que le nouveau soit lu.
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

        var stale = tracks.Where(t => t.GenresCheckedAt is null && saved.Contains(t.Id)).Select(t => t.Id).ToArray();
        if (stale.Length > 0)
            await db.Set<Dictionary<string, object>>(TrackConfiguration.TrackGenresTable)
                .Where(j => stale.Contains(EF.Property<int>(j, TrackConfiguration.TrackIdColumn)))
                .ExecuteDeleteAsync(ct);

        return saved;
    }
}
