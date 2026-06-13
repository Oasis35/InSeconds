using InSeconds.Api.Common.Settings;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Stats.Today;

public sealed class TodayStatsHandler(ApplicationDbContext db, SettingsService settingsService)
{
    public async Task<IResult> Handle(Guid? playerId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var challenge = await db.DailyChallenges
            .FirstOrDefaultAsync(c => c.Date == today, ct);

        if (challenge is null)
            return Results.Ok(new TodayStatsResponse(null, 0, 0, []));

        int? yourScore = null;
        if (playerId.HasValue)
        {
            yourScore = await db.GameSessions
                .Where(s => s.DailyChallengeId == challenge.Id && s.PlayerId == playerId.Value)
                .Select(s => (int?)s.TotalScore)
                .FirstOrDefaultAsync(ct);
        }

        var scores = await db.GameSessions
            .Where(s => s.DailyChallengeId == challenge.Id)
            .Select(s => s.TotalScore)
            .ToListAsync(ct);

        var totalPlayers = scores.Count;
        var medianResult = ComputeMedian(scores);

        var appSettings = await settingsService.GetAsync(ct);

        var trackStats = await db.DailyChallengeTracks
            .Where(t => t.DailyChallengeId == challenge.Id)
            .OrderBy(t => t.Position)
            .Select(t => new
            {
                t.Position,
                t.Track.Artist,
                t.Track.Title,
                t.Track.DeezerTrackId,
                t.Track.CoverHash,
                TotalAnswers      = t.Answers.Count,
                CorrectAnswers    = t.Answers.Count(a => a.ArtistCorrect || a.TitleCorrect),
                AvgSecondsCorrect = t.Answers
                    .Where(a => a.ArtistCorrect || a.TitleCorrect)
                    .Average(a => (double?)a.ListenedDurationSeconds),
            })
            .ToListAsync(ct);

        var tracks = trackStats.Select(t => new TrackStat(
            Position:                  t.Position,
            Artist:                    t.Artist,
            Title:                     t.Title,
            DeezerTrackId:             t.DeezerTrackId,
            CoverUrl:                  t.CoverHash is not null ? appSettings.BuildCoverUrl(t.CoverHash) : null,
            FailureRatePercent:        t.TotalAnswers == 0 ? 0 : Math.Round((1.0 - (double)t.CorrectAnswers / t.TotalAnswers) * 100, 1),
            AverageSecondsWhenCorrect: t.AvgSecondsCorrect.HasValue ? Math.Round(t.AvgSecondsCorrect.Value, 1) : null
        )).ToList();

        return Results.Ok(new TodayStatsResponse(yourScore, medianResult, totalPlayers, tracks));
    }

    private static int ComputeMedian(List<int> values)
    {
        if (values.Count == 0) return 0;
        var sorted = values.Order().ToList();
        var mid = sorted.Count / 2;
        return sorted.Count % 2 == 1
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }
}
