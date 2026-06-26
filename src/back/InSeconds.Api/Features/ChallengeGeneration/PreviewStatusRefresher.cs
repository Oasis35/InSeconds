using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.ChallengeGeneration;

public sealed class PreviewStatusRefresher(
    ApplicationDbContext db,
    DeezerClient deezer,
    ILogger<PreviewStatusRefresher> logger)
{
    public async Task RefreshAsync(CancellationToken ct = default)
    {
        var usedTrackIds = await db.DailyChallengeTracks
            .Select(dct => dct.TrackId)
            .Distinct()
            .ToListAsync(ct);

        var candidates = await db.Tracks
            .Where(t => !usedTrackIds.Contains(t.Id))
            .ToListAsync(ct);

        if (candidates.Count == 0)
        {
            logger.LogInformation("Refresh preview : aucun morceau disponible à vérifier.");
            return;
        }

        var previews = await Task.WhenAll(
            candidates.Select(t => deezer.GetPreviewUrlAsync(t.DeezerTrackId, ct)));

        var changed = 0;
        for (var i = 0; i < candidates.Count; i++)
        {
            var hasPreview = !string.IsNullOrEmpty(previews[i]);
            if (candidates[i].HasPreview != hasPreview)
            {
                candidates[i].HasPreview = hasPreview;
                changed++;
            }
        }

        if (changed > 0)
            await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Refresh preview terminé : {Total} morceaux vérifiés, {Changed} flag(s) mis à jour.",
            candidates.Count, changed);
    }
}
