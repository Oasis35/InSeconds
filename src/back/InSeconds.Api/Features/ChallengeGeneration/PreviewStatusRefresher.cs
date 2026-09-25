using InSeconds.Api.Common.Settings;
using InSeconds.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.ChallengeGeneration;

public sealed record RefreshPreviewsResult(int Checked, int Updated, int Failed);

public sealed class PreviewStatusRefresher(
    ApplicationDbContext db,
    DeezerClient deezer,
    ILogger<PreviewStatusRefresher> logger)
{
    // Deezer limite à ~50 requêtes / 5 s : lots de 10 espacés de 1,5 s ≈ 33 req/5 s max.
    private const int BatchSize = 10;
    private static readonly TimeSpan BatchDelay = TimeSpan.FromSeconds(1.5);

    public async Task<RefreshPreviewsResult> RefreshAsync(CancellationToken ct = default)
    {
        // Mêmes critères de cooldown que DailyChallengeGenerator, évalués pour demain (le job tourne
        // à 23h, la veille de la génération) : un morceau déjà utilisé redevient éligible une fois
        // son cooldown écoulé, son flag doit donc être revérifié avant qu'il puisse être tiré.
        // Les morceaux encore en cooldown sont ignorés (pas éligibles, et ça borne la durée de
        // l'appel admin synchrone). Les morceaux désactivés aussi : ils ne seront pas tirés.
        var cooldownDays = await SettingsRawReader.GetIntAsync(
            db, "TrackCooldownDays", new AppSettings().TrackCooldownDays, ct);
        var tomorrow = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);
        var cutoff = tomorrow.AddDays(-cooldownDays);

        var candidates = await db.Tracks
            .Where(t => !t.IsDisabled && (t.LastUsedDate == null || t.LastUsedDate < cutoff))
            .ToListAsync(ct);

        if (candidates.Count == 0)
        {
            logger.LogInformation("Refresh preview : aucun morceau disponible à vérifier.");
            return new RefreshPreviewsResult(0, 0, 0);
        }

        var updated = 0;
        var failed = 0;

        for (var offset = 0; offset < candidates.Count; offset += BatchSize)
        {
            if (offset > 0)
                await Task.Delay(BatchDelay, ct);

            var batch = candidates.Skip(offset).Take(BatchSize).ToList();
            var probes = await Task.WhenAll(
                batch.Select(t => deezer.ProbePreviewAsync(t.DeezerTrackId, ct)));

            for (var i = 0; i < batch.Count; i++)
            {
                // Échec de requête (rate limit, quota, panne) : état Deezer inconnu, on ne touche pas au flag.
                if (!probes[i].Succeeded)
                {
                    failed++;
                    continue;
                }

                var hasPreview = !string.IsNullOrEmpty(probes[i].PreviewUrl);
                if (batch[i].HasPreview != hasPreview)
                {
                    batch[i].HasPreview = hasPreview;
                    updated++;
                }
            }
        }

        if (updated > 0)
            await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Refresh preview terminé : {Total} morceaux vérifiés, {Updated} flag(s) mis à jour, {Failed} échec(s) Deezer (flags conservés).",
            candidates.Count, updated, failed);

        return new RefreshPreviewsResult(candidates.Count, updated, failed);
    }
}
