using InSeconds.Api.Common.Observability;
using InSeconds.Api.Common.Scoring;
using InSeconds.Api.Common.Sessions;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Stats;
using InSeconds.Api.Common.Streak;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed class SubmitAnswerHandler(
    ApplicationDbContext db,
    ScoreCalculator scoreCalculator,
    TextNormalizer textNormalizer,
    SettingsService settingsService,
    ILogger<SubmitAnswerHandler> logger)
{
    public async Task<IResult> Handle(SubmitAnswerCommand command, CancellationToken cancellationToken)
    {
        var (session, failure) = await db.LoadOwnedSessionAsync(command.SessionId, command.PlayerId, cancellationToken);

        if (failure == SessionLookupFailure.NotFound)
            return Results.NotFound(new { error = "session_not_found", message = "Session introuvable." });

        if (failure == SessionLookupFailure.WrongPlayer)
            return Results.StatusCode(403);

        if (session!.Status != SessionStatus.Pending)
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

        // Anti-triche : la durée soumise ne peut jamais être inférieure au minimum
        // réellement verrouillé côté serveur via PATCH /listening pour ce morceau — sinon un
        // appel API direct pourrait écouter longuement (ou débloquer les indices) puis mentir
        // sur la durée soumise pour maximiser le score. Ne s'applique que si un verrou existe
        // pour ce morceau précis (CurrentTrackId == track soumis) — un skip sans preview
        // (ListenedDurationSeconds=0, jamais verrouillé) reste inchangé.
        if (session.CurrentTrackId == command.DailyChallengeTrackId
            && session.CurrentTrackMinListenedSeconds is { } minListenedSeconds
            && command.ListenedDurationSeconds < minListenedSeconds)
        {
            return Results.BadRequest(new
            {
                error = "listened_duration_below_verified_minimum",
                message = "La durée soumise est inférieure à la durée réellement écoutée pour ce morceau.",
            });
        }

        var appSettings = await settingsService.GetAsync(cancellationToken);

        var artistCorrect = textNormalizer.IsMatch(command.ArtistAnswer, challengeTrack.Artist);
        var titleCorrect  = textNormalizer.IsMatch(command.TitleAnswer,  challengeTrack.Title);

        // Source de vérité serveur — jamais envoyé par le client (cf. RequestHint/anti-triche).
        var hintLevelUsed = session.CurrentTrackHintLevelUsed;

        var score = scoreCalculator.Calculate(
            command.ListenedDurationSeconds,
            artistCorrect,
            titleCorrect,
            appSettings.DurationScores,
            hintLevelUsed,
            appSettings.HintPenaltyPercent);

        var hintPenaltyPercentApplied = hintLevelUsed > 0 && appSettings.HintPenaltyPercent.TryGetValue(hintLevelUsed, out var penaltyPercent)
            ? penaltyPercent
            : 0;

        var priorStats = await GetPriorStatsAsync(command.DailyChallengeTrackId, cancellationToken);

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
            HintLevelUsed           = hintLevelUsed,
        });

        session.AddAnswerScore(score, command.ListenedDurationSeconds);

        // Réinitialiser le verrou anti-cheat (la track est répondue, plus besoin)
        session.ReleaseTrackLock();

        // Vérifier si tous les morceaux du défi ont été répondus → complétion
        var answeredCount = await db.GameSessionAnswers
            .CountAsync(a => a.GameSessionId == command.SessionId, cancellationToken);
        // +1 pour inclure la réponse qu'on vient d'ajouter (pas encore persistée)
        var isLastAnswer = (answeredCount + 1) >= appSettings.TracksPerChallenge;

        if (isLastAnswer && session.Status == SessionStatus.Pending)
            await CompleteSessionAsync(session, command.PlayerId, cancellationToken);

        await db.SaveChangesAsync(cancellationToken);

        // Jamais la réponse saisie (texte libre du joueur) : seulement le résultat.
        PlayerActionLog.AnswerSubmitted(logger, command.PlayerId, command.SessionId, command.DailyChallengeTrackId,
            command.ListenedDurationSeconds, artistCorrect, titleCorrect, hintLevelUsed, score);
        if (session.Status == SessionStatus.Completed)
            PlayerActionLog.SessionCompleted(logger, command.SessionId, command.PlayerId, session.TotalScore);

        var isCorrectNow = artistCorrect || titleCorrect;
        var stats = BuildAnswerStats(priorStats, isCorrectNow, command.ListenedDurationSeconds, appSettings.AllowedDurationsSeconds);

        return Results.Ok(new SubmitAnswerResponse(
            ArtistCorrect:             artistCorrect,
            TitleCorrect:              titleCorrect,
            Score:                     score,
            CorrectArtist:             challengeTrack.Artist,
            CorrectTitle:              TextNormalizationHelpers.CleanDisplayTitle(challengeTrack.Title),
            ListenedDurationSeconds:   command.ListenedDurationSeconds,
            AverageSecondsWhenCorrect: stats.AverageSecondsWhenCorrect,
            FailureRatePercent:        stats.FailureRatePercent,
            GuessTimeDistribution:     stats.GuessTimeDistribution,
            NotFoundCount:             stats.NotFoundCount,
            HintLevelUsed:             hintLevelUsed,
            HintPenaltyPercentApplied: hintPenaltyPercentApplied));
    }

    // Stats déjà en base pour ce morceau, avant d'ajouter la réponse courante — combinées
    // en mémoire par BuildAnswerStats pour éviter un aller-retour DB après le save.
    private async Task<PriorAnswerStats> GetPriorStatsAsync(int dailyChallengeTrackId, CancellationToken ct)
    {
        var totals = await db.GameSessionAnswers
            .Where(a => a.DailyChallengeTrackId == dailyChallengeTrackId)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total        = g.Count(),
                CorrectCount = g.Count(a => a.ArtistCorrect || a.TitleCorrect),
                CorrectSum   = g.Where(a => a.ArtistCorrect || a.TitleCorrect)
                                .Sum(a => (double?)a.ListenedDurationSeconds),
                FailCount    = g.Count(a => !a.ArtistCorrect && !a.TitleCorrect),
            })
            .FirstOrDefaultAsync(ct);

        // Répartition par palier des réponses correctes déjà en base (pour l'histogramme
        // "en combien de temps les autres ont trouvé" affiché à la révélation).
        var byDuration = await db.GameSessionAnswers
            .Where(a => a.DailyChallengeTrackId == dailyChallengeTrackId
                        && (a.ArtistCorrect || a.TitleCorrect))
            .GroupBy(a => a.ListenedDurationSeconds)
            .Select(g => new { Duration = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        return new PriorAnswerStats(
            totals?.Total ?? 0,
            totals?.CorrectCount ?? 0,
            totals?.CorrectSum,
            totals?.FailCount ?? 0,
            byDuration.ToDictionary(x => x.Duration, x => x.Count));
    }

    // Streak basée sur la date du défi, pas la date de complétion : terminer le défi de
    // lundi mardi à 00:15 UTC ne doit pas casser la streak (piège 18).
    private async Task CompleteSessionAsync(GameSession session, Guid playerId, CancellationToken ct)
    {
        session.Complete(DateTime.UtcNow);

        var challengeDate = await db.DailyChallenges
            .Where(c => c.Id == session.DailyChallengeId)
            .Select(c => c.Date)
            .FirstAsync(ct);

        var player = await db.Players.FirstAsync(p => p.Id == playerId, ct);
        var rules = await StreakRulesReader.LoadAsync(db, ct);
        session.RecordStreakEffect(player.RecordChallengeCompletion(challengeDate, rules));
    }

    // Combine les stats déjà en base avec la réponse courante (pas encore persistée au
    // moment de l'appel) pour construire la réponse sans second aller-retour DB.
    private static AnswerStats BuildAnswerStats(
        PriorAnswerStats prior, bool isCorrectNow, decimal listenedDurationSeconds, IReadOnlyList<decimal> allowedDurations)
    {
        var totalAfter        = prior.Total + 1;
        var correctCountAfter = prior.CorrectCount + (isCorrectNow ? 1 : 0);
        var correctSumAfter   = (prior.CorrectSum ?? 0) + (isCorrectNow ? (double)listenedDurationSeconds : 0);
        var failCountAfter    = prior.FailCount + (isCorrectNow ? 0 : 1);

        var correctAvg  = correctCountAfter == 0 ? (double?)null : correctSumAfter / correctCountAfter;
        var failureRate = totalAfter == 0 ? 0d : Math.Round((double)failCountAfter / totalAfter * 100, 1);

        // Distribution projetée sur tous les paliers autorisés (comptes à 0 inclus, ordre croissant),
        // réponse courante ajoutée en mémoire si elle est correcte.
        var durationCounts = new Dictionary<decimal, int>(prior.CorrectCountsByDuration);
        if (isCorrectNow)
            durationCounts[listenedDurationSeconds] = durationCounts.GetValueOrDefault(listenedDurationSeconds) + 1;

        var distribution = GuessTimeDistribution.Build(allowedDurations, durationCounts);

        return new AnswerStats(correctAvg, failureRate, distribution, failCountAfter);
    }

    private sealed record PriorAnswerStats(
        int Total, int CorrectCount, double? CorrectSum, int FailCount,
        Dictionary<decimal, int> CorrectCountsByDuration);

    private sealed record AnswerStats(
        double? AverageSecondsWhenCorrect, double FailureRatePercent,
        List<DurationBucketDto> GuessTimeDistribution, int NotFoundCount);
}
