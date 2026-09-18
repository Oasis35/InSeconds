using InSeconds.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.ChallengeGeneration;

public sealed record RefreshReleaseYearsResult(int Checked, int Updated, int Failed);

// Backfill à la demande de Track.ReleaseYear pour le pool existant (donnée Deezer non captée
// avant l'introduction du système d'indices). Action manuelle depuis l'onglet Actions admin —
// même pattern que PreviewStatusRefresher (pas de BackgroundService récurrent : une fois le
// pool backfillé, AddTrack/UpdateTrack capturent l'année dès l'ajout d'un nouveau morceau).
public sealed class ReleaseYearRefresher(
    ApplicationDbContext db,
    DeezerClient deezer,
    ILogger<ReleaseYearRefresher> logger)
{
    // Même pacing que PreviewStatusRefresher : Deezer limite à ~50 requêtes / 5 s.
    private const int BatchSize = 10;
    private static readonly TimeSpan BatchDelay = TimeSpan.FromSeconds(1.5);

    public async Task<RefreshReleaseYearsResult> RefreshAsync(CancellationToken ct = default)
    {
        var candidates = await db.Tracks
            .Where(t => t.ReleaseYear == null)
            .ToListAsync(ct);

        if (candidates.Count == 0)
        {
            logger.LogInformation("Refresh années de sortie : aucun morceau à vérifier.");
            return new RefreshReleaseYearsResult(0, 0, 0);
        }

        var updated = 0;
        var failed = 0;

        for (var offset = 0; offset < candidates.Count; offset += BatchSize)
        {
            if (offset > 0)
                await Task.Delay(BatchDelay, ct);

            var batch = candidates.Skip(offset).Take(BatchSize).ToList();
            var infos = await Task.WhenAll(
                batch.Select(t => deezer.GetTrackInfoAsync(t.DeezerTrackId, ct)));

            for (var i = 0; i < batch.Count; i++)
            {
                if (infos[i]?.ReleaseYear is not { } year)
                {
                    failed++;
                    continue;
                }

                batch[i].ReleaseYear = year;
                updated++;
            }
        }

        if (updated > 0)
            await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Refresh années de sortie terminé : {Total} morceaux vérifiés, {Updated} mis à jour, {Failed} échec(s).",
            candidates.Count, updated, failed);

        return new RefreshReleaseYearsResult(candidates.Count, updated, failed);
    }
}
