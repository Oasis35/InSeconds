using FluentValidation;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// La réponse du joueur au morceau en cours. <paramref name="ListenedSeconds"/> est le palier **annoncé** (0 pour un morceau sans extrait que le
/// joueur passe) : le serveur le compare à ce qu'il a vu écouter, il ne le croit pas. Le niveau d'indice n'est jamais envoyé : la partie le garde.
/// </summary>
public sealed record SubmitAnswer(int Position, decimal ListenedSeconds, bool WasExtended, string? Artist, string? Title);

public sealed class SubmitAnswerValidator : AbstractValidator<SubmitAnswer>
{
    public SubmitAnswerValidator(DailyRules rules)
    {
        RuleFor(x => x.Position).GreaterThan(0);
        RuleFor(x => x.ListenedSeconds)
            .Must(seconds => seconds == 0 || rules.IsAllowedDuration(seconds))
            .WithMessage("La durée doit être 0 ou l'un des paliers autorisés.");
        RuleFor(x => x.Artist).MaximumLength(200);
        RuleFor(x => x.Title).MaximumLength(300);
    }
}

/// <summary>
/// Ce que la réponse révèle une fois donnée : la correction, les points, le morceau (nom et lien Deezer, jamais envoyés avant), et ce qu'en ont fait les autres.
/// </summary>
/// <param name="Completed">C'était le dernier morceau : la partie est terminée, la série et les gels sont à jour.</param>
public sealed record SubmitAnswerResponse(
    bool ArtistCorrect,
    bool TitleCorrect,
    int Score,
    string CorrectArtist,
    string CorrectTitle,
    long DeezerTrackId,
    string? CoverUrl,
    decimal ListenedSeconds,
    double? AverageSecondsWhenCorrect,
    double FailureRatePercent,
    IReadOnlyList<GuessBucketResponse> GuessTimeDistribution,
    int NotFoundCount,
    int HintLevelUsed,
    int HintPenaltyPercentApplied,
    bool Completed);

/// <summary>La partie et le morceau auquel le joueur répond (nom de référence compris).</summary>
public sealed record AnswerAttempt(PlayableSession Loaded, TrackInfo? Track);

public static class SubmitAnswerEndpoint
{
    public static async Task<AnswerAttempt?> LoadAsync(
        int id, SubmitAnswer request, ICurrentPlayer current, IDailyStore store, ITrackDirectory directory, CancellationToken ct)
    {
        var loaded = await SessionAccess.LoadAsync(id, current, store, ct);
        if (loaded is null)
            return null;

        var track = loaded.TrackAt(request.Position);
        var info = track is null ? null : (await directory.GetAsync([track.TrackId], ct)).GetValueOrDefault(track.TrackId);
        return new AnswerAttempt(loaded, info);
    }

    public static ProblemDetails Validate(SubmitAnswer request, AnswerAttempt? attempt, DailyRules rules, IAnswerMatcher matcher)
    {
        var problem = SessionAccess.Check(attempt?.Loaded, request.Position);
        if (!ReferenceEquals(problem, WolverineContinue.NoProblems))
            return problem;
        if (attempt!.Track is null)
            return DailyProblems.TrackNotFound();

        // Anti-triche (piège 35) : écouter longuement, ou débloquer un indice, puis annoncer un palier court pour gagner plus.
        return Answer(request, attempt, rules, matcher).IsAccepted ? WolverineContinue.NoProblems : DailyProblems.ListenedBelowMinimum();
    }

    /// <summary>
    /// <c>POST /api/daily/sessions/{id}/answers</c> : répond au morceau en cours. **Une seule transaction** : la réponse, le score, et, si c'était le dernier
    /// morceau, la fin de la partie, la série et les gels (piège 18 : sur le jour du défi, jamais sur le moment de la réponse). La partie se termine sur le
    /// nombre **réel** de morceaux du défi (piège 38), pas sur le réglage du moment.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/daily/sessions/{id}/answers", OperationId = "submitAnswer")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<SubmitAnswerResponse> Post(
        SubmitAnswer request,
        AnswerAttempt attempt,
        IDailyStore store,
        IDailyQueries queries,
        IPlayerDirectory players,
        DailyRules rules,
        IAnswerMatcher matcher,
        IGameCalendar calendar,
        ILogger<SubmitAnswerResponse> logger,
        CancellationToken ct)
    {
        var session = attempt.Loaded.Session;
        var challenge = attempt.Loaded.Challenge;
        var info = attempt.Track!;
        var outcome = Answer(request, attempt, rules, matcher).Outcome!;

        var scoring = rules.Scoring;
        var score = scoring.Score(outcome);
        // Les autres joueurs, avant celui-ci : la révélation montre « en combien de temps ils ont trouvé ».
        var prior = await queries.GetPriorAnswerStatsAsync(challenge.Id, request.Position, ct);

        var completed = session.Answer(outcome, score, request.WasExtended, request.Artist, request.Title, challenge.Tracks.Count, calendar.Now);
        DailyLog.AnswerSubmitted(
            logger, session.PlayerId, session.Id, request.Position, outcome.ListenedSeconds, outcome.ArtistCorrect, outcome.TitleCorrect,
            outcome.HintLevelUsed, score, info.Artist, info.DisplayTitle);

        if (completed)
        {
            await CompleteAsync(session, challenge, store, players, rules, ct);
            DailyLog.SessionCompleted(logger, session.Id, session.PlayerId, session.TotalScore);
        }

        var stats = TrackAnswerStats.Build(prior, outcome, rules.AllowedDurations);
        return new SubmitAnswerResponse(
            outcome.ArtistCorrect, outcome.TitleCorrect, score, info.Artist, info.DisplayTitle, info.DeezerTrackId, info.CoverUrl, outcome.ListenedSeconds,
            stats.AverageSecondsWhenFound, stats.FailureRatePercent,
            stats.GuessTimeDistribution.Select(b => new GuessBucketResponse(b.Seconds, b.Count)).ToList(),
            stats.NotFoundCount, outcome.HintLevelUsed, scoring.HintPenaltyPercent(outcome.HintLevelUsed), completed);
    }

    // Calculée sur la date du défi : terminer le défi d'hier après minuit ne casse pas la série (piège 18).
    private static async Task CompleteAsync(
        DailySession session, DailyChallenge challenge, IDailyStore store, IPlayerDirectory players, DailyRules rules, CancellationToken ct)
    {
        var streak = await store.FindStreakAsync(session.PlayerId, ct);
        if (streak is null)
        {
            streak = DailyStreak.Create(session.PlayerId);
            store.Add(streak);
        }

        var isLinked = await players.HasAccountAsync(session.PlayerId, ct);
        session.RecordStreakEffect(streak.RecordCompletion(challenge.Date, isLinked, rules.Streak));
    }

    private static AnswerResult Answer(SubmitAnswer request, AnswerAttempt attempt, DailyRules rules, IAnswerMatcher matcher) =>
        attempt.Loaded.Session.RoundOfCurrentTrack(rules.Hints).Answer(
            request.ListenedSeconds, request.Artist, request.Title, new TrackNames(attempt.Track!.Artist, attempt.Track.Title), matcher);
}
