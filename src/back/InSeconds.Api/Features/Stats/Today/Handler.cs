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
            return Results.Ok(new TodayStatsResponse(null, 0, 0, 0, []));

        int? yourScore = null;
        int currentStreak = 0;
        if (playerId.HasValue)
        {
            yourScore = await db.GameSessions
                .Where(s => s.DailyChallengeId == challenge.Id && s.PlayerId == playerId.Value)
                .Select(s => (int?)s.TotalScore)
                .FirstOrDefaultAsync(ct);

            currentStreak = await db.Players
                .Where(p => p.Id == playerId.Value)
                .Select(p => p.CurrentStreak)
                .FirstOrDefaultAsync(ct);
        }

        var medianResult = await db.Database.SqlQueryRaw<int>(
            """
            SELECT COALESCE(
                CAST(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gs."TotalScore") AS integer),
                0
            ) AS "Value"
            FROM "GameSessions" gs
            INNER JOIN "Players" p ON p."Id" = gs."PlayerId"
            WHERE gs."DailyChallengeId" = {0}
              AND NOT p."IsDeleted"
            """,
            challenge.Id)
            .FirstOrDefaultAsync(ct);

        var totalPlayers = await db.GameSessions
            .CountAsync(s => s.DailyChallengeId == challenge.Id, ct);

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

        return Results.Ok(new TodayStatsResponse(yourScore, medianResult, totalPlayers, currentStreak, tracks));
    }
}
