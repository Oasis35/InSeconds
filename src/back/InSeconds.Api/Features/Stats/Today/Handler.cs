using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Stats;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Stats.Today;

public sealed class TodayStatsHandler(
    ApplicationDbContext db,
    IDbContextFactory<ApplicationDbContext> dbFactory,
    SettingsService settingsService)
{
    public async Task<IResult> Handle(Guid? playerId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var challenge = await db.DailyChallenges
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Date == today, ct);

        if (challenge is null)
            return Results.Ok(new TodayStatsResponse(null, 0, 0, 0, []));

        int? yourScore = null;
        int currentStreak = 0;
        Dictionary<int, (bool ArtistCorrect, bool TitleCorrect, decimal ListenedDuration, int Score)> playerAnswersByPosition = [];
        if (playerId.HasValue)
        {
            var playerSession = await db.GameSessions
                .AsNoTracking()
                .Where(s => s.DailyChallengeId == challenge.Id
                         && s.PlayerId == playerId.Value
                         && s.Status == Domain.SessionStatus.Completed)
                .Select(s => new { s.TotalScore, s.Id })
                .FirstOrDefaultAsync(ct);

            if (playerSession is not null)
            {
                yourScore = playerSession.TotalScore;
                var answers = await db.GameSessionAnswers
                    .AsNoTracking()
                    .Where(a => a.GameSessionId == playerSession.Id)
                    .Select(a => new
                    {
                        a.Track.Position,
                        a.ArtistCorrect,
                        a.TitleCorrect,
                        a.ListenedDurationSeconds,
                        a.Score,
                    })
                    .ToListAsync(ct);
                playerAnswersByPosition = answers.ToDictionary(
                    a => a.Position,
                    a => (a.ArtistCorrect, a.TitleCorrect, a.ListenedDurationSeconds, a.Score));
            }

            currentStreak = await db.Players
                .AsNoTracking()
                .Where(p => p.Id == playerId.Value)
                .Select(p => p.CurrentStreak)
                .FirstOrDefaultAsync(ct);
        }

        // Queries parallèles : un DbContext dédié par query (un contexte ne supporte
        // pas les opérations concurrentes).
        await using var scoresDb     = await dbFactory.CreateDbContextAsync(ct);
        await using var trackStatsDb = await dbFactory.CreateDbContextAsync(ct);
        await using var distDb       = await dbFactory.CreateDbContextAsync(ct);

        var scoresTask = scoresDb.GameSessions
            .AsNoTracking()
            .Where(s => s.DailyChallengeId == challenge.Id && s.Status == Domain.SessionStatus.Completed)
            .Select(s => s.TotalScore)
            .ToListAsync(ct);

        var trackStatsTask = trackStatsDb.DailyChallengeTracks
            .AsNoTracking()
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

        // Histogramme « en combien de temps les autres ont trouvé » par morceau :
        // comptes des bonnes réponses (sessions complétées) groupés par palier d'écoute.
        var distTask = distDb.GameSessionAnswers
            .AsNoTracking()
            .Where(a => a.Track.DailyChallengeId == challenge.Id
                     && a.GameSession.Status == Domain.SessionStatus.Completed
                     && (a.ArtistCorrect || a.TitleCorrect))
            .GroupBy(a => new { a.Track.Position, a.ListenedDurationSeconds })
            .Select(g => new { g.Key.Position, g.Key.ListenedDurationSeconds, Count = g.Count() })
            .ToListAsync(ct);

        var appSettingsTask = settingsService.GetAsync(ct);

        await Task.WhenAll(scoresTask, trackStatsTask, distTask, appSettingsTask);

        var scores      = scoresTask.Result;
        var trackStats  = trackStatsTask.Result;
        var appSettings = appSettingsTask.Result;

        var correctCountsByPosition = distTask.Result
            .GroupBy(x => x.Position)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyDictionary<decimal, int>)g.ToDictionary(x => x.ListenedDurationSeconds, x => x.Count));
        var emptyCounts = (IReadOnlyDictionary<decimal, int>)new Dictionary<decimal, int>();

        var totalPlayers = scores.Count;
        var medianResult = ComputeMedian(scores);

        var tracks = trackStats.Select(t =>
        {
            playerAnswersByPosition.TryGetValue(t.Position, out var pa);
            return new TrackStat(
                Position:                  t.Position,
                Artist:                    t.Artist,
                Title:                     TextNormalizationHelpers.CleanDisplayTitle(t.Title),
                DeezerTrackId:             t.DeezerTrackId,
                CoverUrl:                  t.CoverHash is not null ? appSettings.BuildCoverUrl(t.CoverHash) : null,
                FailureRatePercent:        t.TotalAnswers == 0 ? 0 : Math.Round((1.0 - (double)t.CorrectAnswers / t.TotalAnswers) * 100, 1),
                AverageSecondsWhenCorrect: t.AvgSecondsCorrect.HasValue ? Math.Round(t.AvgSecondsCorrect.Value, 1) : null,
                ArtistCorrect:             playerAnswersByPosition.ContainsKey(t.Position) ? pa.ArtistCorrect : null,
                TitleCorrect:              playerAnswersByPosition.ContainsKey(t.Position) ? pa.TitleCorrect : null,
                ListenedDurationSeconds:   playerAnswersByPosition.ContainsKey(t.Position) ? pa.ListenedDuration : null,
                Score:                     playerAnswersByPosition.ContainsKey(t.Position) ? pa.Score : null,
                GuessTimeDistribution:     GuessTimeDistribution.Build(
                                               appSettings.AllowedDurationsSeconds,
                                               correctCountsByPosition.GetValueOrDefault(t.Position, emptyCounts)),
                NotFoundCount:             t.TotalAnswers - t.CorrectAnswers
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
