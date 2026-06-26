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
        Dictionary<int, (bool ArtistCorrect, bool TitleCorrect, decimal ListenedDuration)> playerAnswersByPosition = [];
        if (playerId.HasValue)
        {
            var playerSession = await db.GameSessions
                .Where(s => s.DailyChallengeId == challenge.Id
                         && s.PlayerId == playerId.Value
                         && s.Status == Domain.SessionStatus.Completed)
                .Select(s => new { s.TotalScore, s.Id })
                .FirstOrDefaultAsync(ct);

            if (playerSession is not null)
            {
                yourScore = playerSession.TotalScore;
                var answers = await db.GameSessionAnswers
                    .Where(a => a.GameSessionId == playerSession.Id)
                    .Select(a => new
                    {
                        a.Track.Position,
                        a.ArtistCorrect,
                        a.TitleCorrect,
                        a.ListenedDurationSeconds,
                    })
                    .ToListAsync(ct);
                playerAnswersByPosition = answers.ToDictionary(
                    a => a.Position,
                    a => (a.ArtistCorrect, a.TitleCorrect, a.ListenedDurationSeconds));
            }

            currentStreak = await db.Players
                .Where(p => p.Id == playerId.Value)
                .Select(p => p.CurrentStreak)
                .FirstOrDefaultAsync(ct);
        }

        var scores = await db.GameSessions
            .Where(s => s.DailyChallengeId == challenge.Id && s.Status == Domain.SessionStatus.Completed)
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
                TotalAnswers      = t.Answers.Count(a => a.GameSession.Status == Domain.SessionStatus.Completed),
                CorrectAnswers    = t.Answers.Count(a => a.GameSession.Status == Domain.SessionStatus.Completed && (a.ArtistCorrect || a.TitleCorrect)),
                AvgSecondsCorrect = t.Answers
                    .Where(a => a.GameSession.Status == Domain.SessionStatus.Completed && (a.ArtistCorrect || a.TitleCorrect))
                    .Average(a => (double?)a.ListenedDurationSeconds),
            })
            .ToListAsync(ct);

        var tracks = trackStats.Select(t =>
        {
            playerAnswersByPosition.TryGetValue(t.Position, out var pa);
            return new TrackStat(
                Position:                  t.Position,
                Artist:                    t.Artist,
                Title:                     t.Title,
                DeezerTrackId:             t.DeezerTrackId,
                CoverUrl:                  t.CoverHash is not null ? appSettings.BuildCoverUrl(t.CoverHash) : null,
                FailureRatePercent:        t.TotalAnswers == 0 ? 0 : Math.Round((1.0 - (double)t.CorrectAnswers / t.TotalAnswers) * 100, 1),
                AverageSecondsWhenCorrect: t.AvgSecondsCorrect.HasValue ? Math.Round(t.AvgSecondsCorrect.Value, 1) : null,
                ArtistCorrect:             playerAnswersByPosition.ContainsKey(t.Position) ? pa.ArtistCorrect : null,
                TitleCorrect:              playerAnswersByPosition.ContainsKey(t.Position) ? pa.TitleCorrect : null,
                ListenedDurationSeconds:   playerAnswersByPosition.ContainsKey(t.Position) ? pa.ListenedDuration : null
            );
        }).ToList();

        return Results.Ok(new TodayStatsResponse(yourScore, medianResult, totalPlayers, currentStreak, tracks));
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
