using InSeconds.Api.Common.Settings;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.GetTracks;

public sealed class GetTracksHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(CancellationToken cancellationToken)
    {
        var cooldownDays = await SettingsRawReader.GetIntAsync(
            db, "TrackCooldownDays", new AppSettings().TrackCooldownDays, cancellationToken);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var allTracks = await db.Tracks
            .AsNoTracking()
            .OrderBy(t => t.Artist)
            .Select(t => new
            {
                t.Id,
                t.Artist,
                t.Title,
                t.DeezerTrackId,
                t.HasPreview,
                t.LastUsedDate,
                t.UsageCount,
                IsUsed = t.DailyChallengeTracks.Any(),
                InTodayChallenge = t.DailyChallengeTracks.Any(d => d.DailyChallenge.Date == today),
            })
            .ToListAsync(cancellationToken);

        DateOnly? ComputeUnlock(DateOnly? lastUsed) =>
            lastUsed?.AddDays(cooldownDays);

        var available = allTracks
            .Where(t => !t.IsUsed)
            .Select(t => new TrackDto(
                t.Id, t.Artist, t.Title, t.DeezerTrackId,
                HasPreview: t.HasPreview,
                LastUsedDate: t.LastUsedDate,
                UsageCount: t.UsageCount,
                UnlockDate: ComputeUnlock(t.LastUsedDate),
                InTodayChallenge: t.InTodayChallenge))
            .ToList();

        var used = allTracks
            .Where(t => t.IsUsed)
            .Select(t => new TrackDto(
                t.Id, t.Artist, t.Title, t.DeezerTrackId,
                // Un morceau utilisé redevient tirable après le cooldown : son état de preview compte aussi.
                HasPreview: t.HasPreview,
                LastUsedDate: t.LastUsedDate,
                UsageCount: t.UsageCount,
                UnlockDate: ComputeUnlock(t.LastUsedDate),
                InTodayChallenge: t.InTodayChallenge))
            .ToList();

        return Results.Ok(new GetTracksResponse(available, used));
    }
}
