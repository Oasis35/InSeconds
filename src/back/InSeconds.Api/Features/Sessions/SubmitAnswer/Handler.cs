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

        if (session.Status != SessionStatus.Pending)
            return Results.StatusCode(403);

        var challengeTrack = await db.DailyChallengeTracks
            .Where(t => t.Id == command.DailyChallengeTrackId && t.DailyChallengeId == session.DailyChallengeId)
            .Select(t => new
            {
                t.Track.Artist,
                t.Track.Title,
                AlreadyAnswered = t.Answers.Any(a => a.GameSessionId == command.SessionId),
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (challengeTrack is null)
            return Results.NotFound(new { error = "track_not_found", message = "Track introuvable dans ce défi." });

        if (challengeTrack.AlreadyAnswered)
            return Results.Conflict(new { error = "already_answered", message = "Cette track a déjà été répondue." });

        var appSettings = await settingsService.GetAsync(cancellationToken);

        var artistCorrect = textNormalizer.IsMatch(command.ArtistAnswer, challengeTrack.Artist);
        var titleCorrect  = textNormalizer.IsMatch(command.TitleAnswer,  challengeTrack.Title);

        var score = scoreCalculator.Calculate(
            command.ListenedDurationSeconds,
            artistCorrect,
            titleCorrect,
            appSettings.DurationScores);

        // Stats calculées sur les réponses déjà en base, avant d'ajouter la nôtre —
        // on la combine en mémoire pour éviter un aller-retour DB après le save.
        var priorStats = await db.GameSessionAnswers
            .Where(a => a.DailyChallengeTrackId == command.DailyChallengeTrackId)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total        = g.Count(),
                CorrectCount = g.Count(a => a.ArtistCorrect || a.TitleCorrect),
                CorrectSum   = g.Where(a => a.ArtistCorrect || a.TitleCorrect)
                                .Sum(a => (double?)a.ListenedDurationSeconds),
                FailCount    = g.Count(a => !a.ArtistCorrect && !a.TitleCorrect),
            })
            .FirstOrDefaultAsync(cancellationToken);

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

        // Réinitialiser le verrou anti-cheat (la track est répondue, plus besoin)
        session.CurrentTrackId                = null;
        session.CurrentTrackMinListenedSeconds = null;

        // Vérifier si tous les morceaux du défi ont été répondus → complétion
        var answeredCount = await db.GameSessionAnswers
            .CountAsync(a => a.GameSessionId == command.SessionId, cancellationToken);
        // +1 pour inclure la réponse qu'on vient d'ajouter (pas encore persistée)
        var isLastAnswer = (answeredCount + 1) >= appSettings.TracksPerChallenge;

        if (isLastAnswer && session.Status == SessionStatus.Pending)
        {
            session.Status      = SessionStatus.Completed;
            session.CompletedAt = DateTime.UtcNow;

            // Streak basée sur la date du défi, pas la date de complétion : terminer
            // le défi de lundi mardi à 00:15 UTC ne doit pas casser la streak (piège 18).
            var challengeDate = await db.DailyChallenges
                .Where(c => c.Id == session.DailyChallengeId)
                .Select(c => c.Date)
                .FirstAsync(cancellationToken);

            var player = await db.Players.FirstAsync(p => p.Id == command.PlayerId, cancellationToken);
            player.CurrentStreak  = player.LastPlayedDate == challengeDate.AddDays(-1) ? player.CurrentStreak + 1 : 1;
            player.LastPlayedDate = challengeDate;
        }

        await db.SaveChangesAsync(cancellationToken);

        var isCorrectNow      = artistCorrect || titleCorrect;
        var totalAfter        = (priorStats?.Total ?? 0) + 1;
        var correctCountAfter = (priorStats?.CorrectCount ?? 0) + (isCorrectNow ? 1 : 0);
        var correctSumAfter   = (priorStats?.CorrectSum ?? 0) + (isCorrectNow ? (double)command.ListenedDurationSeconds : 0);
        var failCountAfter    = (priorStats?.FailCount ?? 0) + (isCorrectNow ? 0 : 1);

        var correctAvg  = correctCountAfter == 0 ? (double?)null : correctSumAfter / correctCountAfter;
        var failureRate = totalAfter == 0 ? 0d : Math.Round((double)failCountAfter / totalAfter * 100, 1);

        return Results.Ok(new SubmitAnswerResponse(
            ArtistCorrect:             artistCorrect,
            TitleCorrect:              titleCorrect,
            Score:                     score,
            CorrectArtist:             challengeTrack.Artist,
            CorrectTitle:              challengeTrack.Title,
            ListenedDurationSeconds:   command.ListenedDurationSeconds,
            AverageSecondsWhenCorrect: correctAvg,
            FailureRatePercent:        failureRate));
    }
}
