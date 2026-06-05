using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.ChallengeGeneration;

public sealed class DailyChallengeGenerator(
    ApplicationDbContext db,
    SettingsService settingsService,
    ILogger<DailyChallengeGenerator> logger)
{
    public async Task GenerateAsync(CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var alreadyExists = await db.DailyChallenges.AnyAsync(c => c.Date == today, ct);
        if (alreadyExists)
        {
            logger.LogInformation("Défi du {Date} déjà présent, génération ignorée.", today);
            return;
        }

        var usedTrackIds = await db.DailyChallengeTracks
            .Select(dct => dct.TrackId)
            .Distinct()
            .ToListAsync(ct);

        var available = await db.Tracks
            .Where(t => !usedTrackIds.Contains(t.Id))
            .OrderBy(t => t.Id)
            .ToListAsync(ct);

        var settings = await settingsService.GetAsync(ct);
        var n = settings.TracksPerChallenge;

        if (available.Count < n)
        {
            logger.LogError(
                "Pool insuffisant : {Count} morceau(x) disponible(s), {Required} requis pour le défi du {Date}.",
                available.Count, n, today);
            return;
        }

        var rng = new Random(today.DayNumber);
        var selected = available.OrderBy(_ => rng.Next()).Take(n).ToList();

        var challenge = new DailyChallenge
        {
            Date = today,
            Seed = today.DayNumber,
        };
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync(ct);

        db.DailyChallengeTracks.AddRange(selected.Select((t, i) => new DailyChallengeTrack
        {
            DailyChallengeId   = challenge.Id,
            TrackId            = t.Id,
            Position           = i + 1,
            DeezerRankSnapshot = 0,
        }));
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Défi du {Date} généré : {N} morceaux.", today, n);
    }
}
