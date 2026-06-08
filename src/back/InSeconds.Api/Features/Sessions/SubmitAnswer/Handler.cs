using InSeconds.Api.Common.Scoring;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed class SubmitAnswerHandler(
    ApplicationDbContext db,
    ScoreCalculator scoreCalculator,
    TextNormalizer textNormalizer,
    SettingsService settingsService)
{
    public async Task<IResult> Handle(SubmitAnswerCommand command, CancellationToken cancellationToken)
    {
        var session = await db.GameSessions
            .FirstOrDefaultAsync(s => s.Id == command.SessionId, cancellationToken);

        if (session is null)
            return Results.NotFound(new { error = "session_not_found", message = "Session introuvable." });

        if (session.PlayerId != command.PlayerId)
            return Results.StatusCode(403);

        var challengeTrack = await db.DailyChallengeTracks
            .Include(t => t.Track)
            .FirstOrDefaultAsync(
                t => t.Id == command.DailyChallengeTrackId && t.DailyChallengeId == session.DailyChallengeId,
                cancellationToken);

        if (challengeTrack is null)
            return Results.NotFound(new { error = "track_not_found", message = "Track introuvable dans ce défi." });

        var alreadyAnswered = await db.GameSessionAnswers
            .AnyAsync(
                a => a.GameSessionId == command.SessionId && a.DailyChallengeTrackId == command.DailyChallengeTrackId,
                cancellationToken);

        if (alreadyAnswered)
            return Results.Conflict(new { error = "already_answered", message = "Cette track a déjà été répondue." });

        var appSettings = await settingsService.GetAsync(cancellationToken);

        var artistCorrect = textNormalizer.IsMatch(command.ArtistAnswer, challengeTrack.Track.Artist);
        var titleCorrect  = textNormalizer.IsMatch(command.TitleAnswer,  challengeTrack.Track.Title);

        var score = scoreCalculator.Calculate(
            command.ListenedDurationSeconds,
            command.WasExtended,
            artistCorrect,
            titleCorrect,
            appSettings.DurationScores);

        db.GameSessionAnswers.Add(new GameSessionAnswer
        {
            GameSessionId           = command.SessionId,
            DailyChallengeTrackId   = command.DailyChallengeTrackId,
            ListenedDurationSeconds = command.ListenedDurationSeconds,
            WasExtended             = command.WasExtended,
            ArtistAnswer            = command.ArtistAnswer,
            TitleAnswer             = command.TitleAnswer,
            ArtistCorrect           = artistCorrect,
            TitleCorrect            = titleCorrect,
            Score                   = score,
        });

        session.TotalScore           += score;
        session.TotalDurationSeconds += command.ListenedDurationSeconds;

        await db.SaveChangesAsync(cancellationToken);

        var stats = await db.GameSessionAnswers
            .Where(a => a.DailyChallengeTrackId == command.DailyChallengeTrackId)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total      = g.Count(),
                CorrectAvg = g.Where(a => a.ArtistCorrect || a.TitleCorrect)
                              .Average(a => (double?)a.ListenedDurationSeconds),
                FailCount  = g.Count(a => !a.ArtistCorrect && !a.TitleCorrect),
            })
            .FirstOrDefaultAsync(cancellationToken);

        var failureRate = stats is null || stats.Total == 0
            ? 0d
            : Math.Round((double)stats.FailCount / stats.Total * 100, 1);

        return Results.Ok(new SubmitAnswerResponse(
            ArtistCorrect:             artistCorrect,
            TitleCorrect:              titleCorrect,
            Score:                     score,
            CorrectArtist:             challengeTrack.Track.Artist,
            CorrectTitle:              challengeTrack.Track.Title,
            ListenedDurationSeconds:   command.ListenedDurationSeconds,
            AverageSecondsWhenCorrect: stats?.CorrectAvg,
            FailureRatePercent:        failureRate));
    }
}
