using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.ChallengeGeneration;

public enum GenerateResult { Success, AlreadyExists, PoolInsufficient }

public sealed class DailyChallengeGenerator(
    ApplicationDbContext db,
    SettingsService settingsService,
    ILogger<DailyChallengeGenerator> logger)
{
    public async Task<GenerateResult> GenerateAsync(CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var alreadyExists = await db.DailyChallenges.AnyAsync(c => c.Date == today, ct);
        if (alreadyExists)
        {
            logger.LogInformation("Défi du {Date} déjà présent, génération ignorée.", today);
            return GenerateResult.AlreadyExists;
        }

        var usedTrackIds = await db.DailyChallengeTracks
            .Select(dct => dct.TrackId)
            .Distinct()
            .ToListAsync(ct);

        var candidates = await db.Tracks
            .Where(t => !usedTrackIds.Contains(t.Id) && t.HasPreview)
            .ToListAsync(ct);

        var settings = await settingsService.GetAsync(ct);
        var n = settings.TracksPerChallenge;

        if (candidates.Count < n)
        {
            logger.LogError(
                "Pool insuffisant : {Count} morceau(x) avec preview disponible(s), {Required} requis pour le défi du {Date}.",
                candidates.Count, n, today);
            return GenerateResult.PoolInsufficient;
        }

        var rng = new Random(today.DayNumber);
        for (var i = candidates.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (candidates[i], candidates[j]) = (candidates[j], candidates[i]);
        }
        var selected = candidates.Take(n).ToList();

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

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

        await transaction.CommitAsync(ct);

        logger.LogInformation("Défi du {Date} généré : {N} morceaux.", today, n);
        return GenerateResult.Success;
    }
}
