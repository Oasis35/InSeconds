using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// Un morceau à jouer. **Ni artiste, ni titre, ni année, ni identifiant Deezer** : envoyés avant la réponse, ils la donneraient
/// (<c>deezer.com/track/{id}</c>, piège 31). Ils n'arrivent qu'avec la réponse du joueur.
/// </summary>
/// <param name="PreviewUrl">L'extrait de 30 s, signée et périssable (piège 14) ; vide si Deezer n'en a pas : le joueur passe le morceau.</param>
public sealed record TrackSlot(int Position, string PreviewUrl, string? CoverUrl);

/// <summary>Une réponse déjà donnée, rendue à la reprise : le morceau est révélé, le joueur l'a répondu.</summary>
public sealed record ResumedAnswer(
    int Position, bool ArtistCorrect, bool TitleCorrect, int Score, decimal ListenedSeconds, int HintLevel,
    string CorrectArtist, string CorrectTitle, long DeezerTrackId);

/// <summary>Le morceau en cours d'une partie reprise : ce que le serveur a vu et révélé (la reprise ne redonne pas ces indices à payer).</summary>
/// <param name="ListenedSeconds">Le plus long palier déjà écouté : le plancher anti-triche, les paliers plus courts ne sont plus proposés.</param>
/// <param name="HintLevel">Le niveau d'indice déjà révélé.</param>
/// <param name="HintFacts">Ce que ces indices ont révélé.</param>
public sealed record CurrentTrackState(int Position, decimal ListenedSeconds, int HintLevel, IReadOnlyList<HintFactResponse> HintFacts);

/// <param name="NextPosition">Le morceau à jouer maintenant : le premier sans réponse (1 pour une nouvelle partie).</param>
/// <param name="CurrentTrack">Ce que la partie a déjà vu du morceau en cours ; vide si le joueur n'a encore rien écouté dessus.</param>
public sealed record StartSessionResponse(
    int SessionId,
    IReadOnlyList<TrackSlot> Tracks,
    StreakResponse Streak,
    bool IsResuming,
    int NextPosition,
    IReadOnlyList<ResumedAnswer> CompletedAnswers,
    CurrentTrackState? CurrentTrack);

/// <summary>Ce que le démarrage a trouvé : le défi du jour (peut-être généré à l'instant) et la partie du joueur, s'il en a une.</summary>
public sealed record StartContext(Guid PlayerId, DailyChallenge? Challenge, DailySession? Session);

public static class StartSessionEndpoint
{
    /// <summary>
    /// Étape de chargement, dans la transaction ouverte par Wolverine : le démarrage d'un joueur est réservé (deux démarrages simultanés se
    /// suivent), ses parties d'un jour passé expirent, et le défi du jour est généré **à la volée** s'il manque (la tâche de minuit a
    /// raté : même logique que les autres chemins, § 5.4 bis).
    /// </summary>
    public static async Task<StartContext> LoadAsync(
        ICurrentPlayer current,
        IDailyStore store,
        ITrackDirectory tracks,
        ITrackUsage usage,
        ITrackSelector selector,
        IOptionsMonitor<DailyOptions> options,
        IGameCalendar calendar,
        ILogger<GenerateDailyChallenge> generationLogger,
        CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var today = calendar.Today;

        await store.LockPlayerStartAsync(playerId, ct);
        await store.ExpireStaleSessionsAsync(playerId, today, calendar.Now, ct);

        var challenge = await store.FindChallengeAsync(today, ct);
        if (challenge is null)
        {
            DailyLog.GeneratingOnTheFly(generationLogger, today);
            var generated = await GenerateDailyChallengeHandler.Handle(
                new GenerateDailyChallenge(today, ChallengeOrigin.OnTheFly), store, tracks, usage, selector, options, generationLogger, ct);
            if (generated.Outcome != GenerationOutcome.PoolInsufficient)
                challenge = await store.FindChallengeAsync(today, ct);
        }

        var session = challenge is null ? null : await store.FindSessionAsync(playerId, challenge.Id, ct);
        return new StartContext(playerId, challenge, session);
    }

    public static ProblemDetails Validate(StartContext context)
    {
        if (context.Challenge is null)
            return DailyProblems.NoChallenge();
        return context.Session is { Status: not SessionStatus.Pending } session ? DailyProblems.NotPending(session.Status) : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>POST /api/daily/sessions</c> : démarre la partie du jour, ou la reprend si elle est en cours (le front l'appelle au clic « Commencer »
    /// ou « Reprendre », jamais à l'arrivée sur la page). Le navigateur a d'abord une identité (<c>POST /api/players/guest</c>) : 401 sinon. 409
    /// <c>daily.already_played</c> / <c>daily.abandoned</c> si la partie du jour est finie, 503 <c>daily.no_challenge</c> si le pool ne permet
    /// pas de défi.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/daily/sessions", OperationId = "startSession")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public static async Task<StartSessionResponse> Post(
        // Chargé par LoadAsync : pas le corps de la requête (ce POST n'en a pas).
        [NotBody] StartContext context,
        IDailyStore store,
        ITrackDirectory directory,
        ITrackPreviews previews,
        IPlayerDirectory players,
        [NotBody] DailyRules rules,
        IGameCalendar calendar,
        ILogger<StartSessionResponse> logger,
        CancellationToken ct)
    {
        var challenge = context.Challenge!;
        var playerId = context.PlayerId;

        var resuming = context.Session is not null;
        var session = context.Session ?? DailySession.Start(playerId, challenge.Id, calendar.Now);
        if (!resuming)
            await store.AddAsync(session, ct);

        var positions = challenge.Tracks.OrderBy(t => t.Position).ToList();
        var infos = await directory.GetAsync(positions.Select(t => t.TrackId).ToList(), ct);
        var previewUrls = await previews.GetUrlsAsync(positions.Select(t => infos[t.TrackId]).ToList(), ct);
        var slots = positions
            .Select(t => new TrackSlot(t.Position, previewUrls.GetValueOrDefault(t.TrackId, string.Empty), infos[t.TrackId].CoverUrl))
            .ToList();

        var streak = await store.FindStreakAsync(playerId, ct);
        var isLinked = await players.HasAccountAsync(playerId, ct);
        var view = streak?.View(calendar.Today, isLinked, rules.Streak) ?? DailyStreak.None(calendar.Today, isLinked, rules.Streak);

        if (!resuming)
        {
            DailyLog.SessionStarted(logger, session.Id, playerId, challenge.Id);
            return new StartSessionResponse(session.Id, slots, StreakResponse.From(view), false, 1, [], null);
        }

        DailyLog.SessionResumed(logger, session.Id, playerId, session.AnsweredCount);
        var completed = session.Answers.OrderBy(a => a.Position).Select(a =>
        {
            var info = infos[positions.First(t => t.Position == a.Position).TrackId];
            return new ResumedAnswer(
                a.Position, a.ArtistCorrect, a.TitleCorrect, a.Score, a.ListenedSeconds, a.HintLevel, info.Artist, info.DisplayTitle, info.DeezerTrackId);
        }).ToList();

        return new StartSessionResponse(
            session.Id, slots, StreakResponse.From(view), true, session.NextPosition, completed, CurrentTrackOf(session, positions, infos, rules));
    }

    private static CurrentTrackState? CurrentTrackOf(
        DailySession session, IReadOnlyList<ChallengeTrack> positions, IReadOnlyDictionary<int, TrackInfo> infos, DailyRules rules)
    {
        if (session.CurrentPosition != session.NextPosition)
            return null;

        var round = session.RoundOfCurrentTrack(rules.Hints);
        var info = infos[positions.First(t => t.Position == session.NextPosition).TrackId];
        var subject = new HintSubject(info.Artist, info.Title, (short?)info.ReleaseYear);
        var facts = round.HintLevel == 0
            ? []
            : HintFacts.UpTo(round.HintLevel, rules.HintProviders, subject)
                .Select(f => new HintFactResponse(HintLevelInfo.KindNameOf(f.Kind), f.Value)).ToList();
        return new CurrentTrackState(session.NextPosition, round.ListenedSeconds, round.HintLevel, facts);
    }
}
