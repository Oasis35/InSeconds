using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

// Les routes de la partie, calquées sur celles du Daily (LoadAsync / Validate / Post, jamais de SaveChangesAsync : la transaction est celle de
// Wolverine). L'accès sur invitation n'est demandé que pour lancer un run ; relever une playlist demande seulement d'en avoir le lien.

/// <param name="HasAccess">Le joueur peut lancer un run (admin, ou compte autorisé).</param>
/// <param name="Record">Son record ; vide s'il n'en a pas.</param>
/// <param name="Pending">Sa partie en cours la plus récente, à reprendre.</param>
/// <param name="Level">Son niveau (points de niveau, disque, progression vers le suivant) ; vide avant sa première partie finie.</param>
/// <param name="Received">Le défi d'un ami à jouer (reçu en ouvrant son lien, pas refusé, pas expiré) ; vide sans compte ou sans défi.</param>
public sealed record RunsMeResponse(
    bool HasAccess, RunRecordResponse? Record, RunPendingResponse? Pending, RunLevelResponse? Level = null,
    RunReceivedChallengeResponse? Received = null)
{
    public static RunsMeResponse Nobody { get; } = new(false, null, null);
}

public sealed record RunPendingResponse(int SessionId, string ChallengeCode);

/// <summary>Un thème proposé avant sa manche : identifiant, nom, manche qu'il concernera et icône (Lucide), vide s'il n'en a pas.</summary>
public sealed record RunThemeOfferItem(int Id, string Name, int Round, string? Icon = null);

public static class GetRunsMeEndpoint
{
    /// <summary>
    /// <c>GET /api/runs/me</c> : anonyme permis, lecture seule. L'accès du joueur (la carte de l'accueil), son record, sa partie en cours et son niveau. Sans identité : <c>hasAccess</c> à faux, rien n'est créé.
    /// </summary>
    [WolverineGet("/api/runs/me", OperationId = "getRunsMe")]
    public static async Task<RunsMeResponse> Get(
        ICurrentPlayer current, IRunAccess access, IRunsQueries queries, RunsRules rules, RunReceivedChallenges received, TimeProvider time,
        CancellationToken ct)
    {
        if (current.PlayerId is not { } playerId)
            return RunsMeResponse.Nobody;

        var record = await queries.FindRecordAsync(playerId, ct);
        var pending = await queries.FindPendingSessionAsync(playerId, ct);
        return new RunsMeResponse(
            await access.CanPlayAsync(playerId, ct),
            record is null ? null : new RunRecordResponse(record.BestScore, record.BestRoundsPassed, IsNew: false),
            pending is null ? null : new RunPendingResponse(pending.SessionId, pending.ChallengeCode),
            RunViews.LevelOf(await queries.FindLevelAsync(playerId, ct), rules.LevelRules, sessionId: null, time.GetUtcNow()),
            await received.PendingAsync(playerId, time.GetUtcNow(), ct));
    }
}

/// <summary>Ce que le lancement d'un run a trouvé : l'accès du joueur et, s'il l'a, le défi tiré.</summary>
public sealed record RunLaunch(Guid PlayerId, bool HasAccess, PlanResult? Plan);

public static class LaunchRunEndpoint
{
    public static async Task<RunLaunch> LoadAsync(
        ICurrentPlayer current, IRunAccess access, IRunsStore store, RunChallengePlanner planner, ILogger<RunLaunch> logger,
        CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        if (!await access.CanPlayAsync(playerId, ct))
            return new RunLaunch(playerId, false, null);

        await store.LockPlayerStartAsync(playerId, ct);
        var plan = await planner.PlanAsync(playerId, ct);
        if (plan.Challenge is null)
            RunsLog.PoolInsufficient(logger, plan.EligibleCount, plan.Requested);
        return new RunLaunch(playerId, true, plan);
    }

    public static ProblemDetails Validate(RunLaunch launch)
    {
        if (!launch.HasAccess)
            return RunsProblems.AccessDenied();
        return launch.Plan?.Challenge is null ? RunsProblems.NoChallenge() : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>POST /api/runs/challenges</c> : lance un run. Tire une nouvelle playlist (règles figées, première manche) et crée la partie de son auteur, dans
    /// la même transaction, puis rend la partie et l'extrait du premier morceau. 403 <c>runs.access_denied</c> sans accès (invité, compte non
    /// autorisé), 503 <c>runs.no_challenge</c> si le pool ne suffit pas, 429 au-delà de 20 lancements en 10 minutes.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/challenges", OperationId = "launchRun")]
    [EnableRateLimiting(RateLimitPolicies.RunLaunch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public static async Task<RunPlayResponse> Post(
        [NotBody] RunLaunch launch, IRunsStore store, [NotBody] RunPlayer player, TimeProvider time, [NotBody] RunsMetrics metrics,
        ILogger<RunLaunch> logger, CancellationToken ct)
    {
        var challenge = launch.Plan!.Challenge!;
        store.AddChallenge(challenge);
        var session = RunSession.Start(challenge.Id, launch.PlayerId, time.GetUtcNow());
        await store.AddAsync(session, ct);
        RunsLog.RunLaunched(logger, session.Id, launch.PlayerId, challenge.Code);
        metrics.RunLaunched();

        return await player.AdvanceAsync(await player.LoadAsync(session, challenge, ct), answered: null, revealed: null, isResuming: false, ct);
    }
}

/// <summary>Ce que montre le lien d'une playlist (écran « lien reçu ») : jamais un morceau (piège 31), ni le nombre de joueurs.</summary>
/// <param name="AuthorPseudo">Le pseudo de son auteur ; vide pour un invité ou un compte effacé (« Invité » à l'écran).</param>
/// <param name="Lives">Les vies au départ (règles figées).</param>
/// <param name="ListenSeconds">L'écoute des morceaux de la première manche (le palier le plus long).</param>
/// <param name="MyStatus">La partie du joueur sur cette playlist : <c>none</c> (pas jouée), <c>pending</c>, <c>lost</c> ou <c>abandoned</c>.</param>
/// <param name="MySessionId">Sa partie sur cette playlist, s'il en a une.</param>
/// <param name="AnswerSeconds">Le chrono de chaque morceau (règles figées) ; 0 : pas de chrono.</param>
/// <param name="Themes">Les manches à thème déjà choisies (jamais la première), avec le nom du thème ; vide : aucune.</param>
public sealed record RunChallengeResponse(
    string Code, string? AuthorPseudo, int Lives, int TracksPerRound, decimal ListenSeconds, string MyStatus, int? MySessionId,
    int AnswerSeconds, IReadOnlyList<RunRoundThemeResponse>? Themes = null);

public static class GetRunChallengeEndpoint
{
    public static Task<RunChallenge?> LoadAsync(string code, IRunsStore store, CancellationToken ct) => RunChallengeAccess.FindAsync(code, store, ct);

    public static ProblemDetails Validate(RunChallenge? challenge) =>
        challenge is null ? RunsProblems.ChallengeNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/runs/challenges/{code}</c> : anonyme permis, lecture seule (un ami sans identité ouvre le lien). Le code se saisit sans tenir
    /// compte de la casse. 404 <c>runs.challenge_not_found</c> pour un code inconnu, 429 au-delà de 60 lectures en 5 minutes par IP.
    /// </summary>
    [WolverineGet("/api/runs/challenges/{code}", OperationId = "getRunChallenge")]
    [EnableRateLimiting(RateLimitPolicies.RunLink)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static async Task<RunChallengeResponse> Get(
        [NotBody] RunChallenge challenge, ICurrentPlayer current, IRunsQueries queries, IPlayerDirectory players, CancellationToken ct)
    {
        string? author = null;
        if (challenge.CreatedBy is { } createdBy)
            author = (await players.GetDisplayNamesAsync([createdBy], ct)).GetValueOrDefault(createdBy);

        var mine = current.PlayerId is { } playerId ? await queries.FindSessionAsync(challenge.Id, playerId, ct) : null;
        var rules = challenge.Rules;
        return new RunChallengeResponse(
            challenge.Code, author, rules.Lives, rules.TracksPerRound,
            rules.ListenAt(0), mine is null ? "none" : RunViews.StatusOf(mine.Status), mine?.SessionId, rules.AnswerSeconds, RunViews.ThemesOf(rules));
    }
}

/// <summary>Ce que le démarrage sur une playlist a trouvé : le défi et la partie du joueur dessus, s'il en a une.</summary>
public sealed record RunJoin(Guid PlayerId, bool HasAccess, RunChallenge? Challenge, RunSession? Session);

public static class JoinRunEndpoint
{
    public static async Task<RunJoin> LoadAsync(string code, ICurrentPlayer current, IRunAccess access, IRunsStore store, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        if (!await access.CanPlayAsync(playerId, ct))
            return new RunJoin(playerId, false, null, null);

        var challenge = await RunChallengeAccess.FindAsync(code, store, ct);
        if (challenge is null)
            return new RunJoin(playerId, true, null, null);

        // Deux démarrages simultanés (double clic, deux onglets) se suivent : le second reprend la partie que le premier a créée.
        await store.LockPlayerStartAsync(playerId, ct);
        return new RunJoin(playerId, true, challenge, await store.FindSessionAsync(challenge.Id, playerId, ct));
    }

    public static ProblemDetails Validate(RunJoin join)
    {
        if (!join.HasAccess)
            return RunsProblems.AccessDenied();
        if (join.Challenge is null)
            return RunsProblems.ChallengeNotFound();
        return join.Session is { IsPending: false } session ? RunsProblems.NotPending(session.Status) : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>POST /api/runs/challenges/{code}/sessions</c> : relève la playlist, ou reprend sa partie en cours dessus (comme <c>POST /api/daily/sessions</c>).
    /// Comme le lancement, elle exige l'accès au mode (admin, ou compte autorisé) : le lien d'un ami ne l'ouvre plus à un invité ni à un compte sans
    /// accès, 403 <c>runs.access_denied</c> ; sans identité, 401. Une playlist se joue une fois : 409 <c>runs.already_played</c> / <c>runs.abandoned</c>
    /// si la partie est finie.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/challenges/{code}/sessions", OperationId = "joinRun")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<RunPlayResponse> Post(
        [NotBody] RunJoin join, IRunsStore store, [NotBody] RunPlayer player, TimeProvider time, [NotBody] RunsMetrics metrics,
        ILogger<RunJoin> logger, CancellationToken ct)
    {
        var challenge = join.Challenge!;
        var resuming = join.Session is not null;
        var session = join.Session ?? RunSession.Start(challenge.Id, join.PlayerId, time.GetUtcNow());
        if (resuming)
        {
            RunsLog.SessionResumed(logger, session.Id, join.PlayerId, session.Answers.Count);
        }
        else
        {
            await store.AddAsync(session, ct);
            RunsLog.SessionJoined(logger, session.Id, join.PlayerId, challenge.Code);
            metrics.SessionJoined();
        }

        return await player.AdvanceAsync(await player.LoadAsync(session, challenge, ct), answered: null, revealed: null, resuming, ct);
    }
}

internal static class RunChallengeAccess
{
    /// <summary>Le défi de ce code, saisi sans tenir compte de la casse ; un texte qui ne peut pas être un code ne va pas jusqu'à la base.</summary>
    public static async Task<RunChallenge?> FindAsync(string code, IRunsStore store, CancellationToken ct) =>
        RunChallengeCode.Normalize(code) is { } normalized ? await store.FindChallengeAsync(normalized, ct) : null;
}

/// <summary>La partie d'un joueur, verrouillée pour la durée de la transaction, et le défi qu'elle joue.</summary>
public sealed record PlayableRun(RunSession Session, RunChallenge Challenge);

/// <summary>Ce que partagent les routes qui agissent sur une partie en cours : la charger, et refuser ce qui n'a pas lieu d'être.</summary>
internal static class RunSessionAccess
{
    /// <summary>
    /// La partie de cet identifiant si elle appartient au joueur de la requête, **verrouillée** jusqu'à la fin de la transaction. La partie d'un autre
    /// joueur est rendue comme une partie inconnue.
    /// </summary>
    public static async Task<PlayableRun?> LoadAsync(int sessionId, ICurrentPlayer current, IRunsStore store, CancellationToken ct)
    {
        if (current.PlayerId is not { } playerId)
            return null;
        var session = await store.FindSessionForUpdateAsync(sessionId, playerId, ct);
        if (session is null)
            return null;
        // Le défi d'une partie existe toujours : la clé étrangère l'impose.
        var challenge = await store.FindChallengeAsync(session.ChallengeId, ct);
        return challenge is null ? null : new PlayableRun(session, challenge);
    }

    /// <summary>La partie est inconnue, n'est plus en cours, ou ce morceau n'est pas le morceau en cours (piège 35). Sans position : on ne vise aucun morceau.</summary>
    public static ProblemDetails Check(PlayableRun? loaded, int? position)
    {
        if (loaded is null)
            return RunsProblems.SessionNotFound();
        if (!loaded.Session.IsPending)
            return RunsProblems.NotPending(loaded.Session.Status);
        if (position is { } p && RunsProblems.ForTurn(loaded.Session.TurnOf(p, loaded.Challenge.Tracks.Count)) is { } problem)
            return problem;
        return WolverineContinue.NoProblems;
    }
}

public static class GetRunSessionEndpoint
{
    public static async Task<LoadedRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, [NotBody] RunPlayer player, CancellationToken ct)
    {
        if (current.PlayerId is not { } playerId)
            return null;
        var session = await store.ReadSessionAsync(id, playerId, ct);
        var challenge = session is null ? null : await store.FindChallengeAsync(session.ChallengeId, ct);
        return challenge is null ? null : await player.LoadAsync(session!, challenge, ct);
    }

    public static ProblemDetails Validate(LoadedRun? run) => run is null ? RunsProblems.SessionNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/runs/sessions/{id}</c> : l'état d'une partie, en lecture seule (en-tête, manche en cours et pastilles, ou résultat de
    /// fin). Ni Deezer ni extrait : l'extrait du morceau en cours arrive avec le démarrage ou la reprise, et par <c>POST …/preview</c>. La partie d'un
    /// autre joueur : 404 <c>runs.session_not_found</c>.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/runs/sessions/{id}", OperationId = "getRunSession")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static Task<RunSessionResponse> Get([NotBody] LoadedRun run, [NotBody] RunPlayer player, CancellationToken ct) => player.StateAsync(run, ct);
}

/// <summary>Le joueur a écouté ce passage du morceau en cours.</summary>
public sealed record UpdateRunListening(int Position, decimal ListenedSeconds);

public sealed class UpdateRunListeningValidator : AbstractValidator<UpdateRunListening>
{
    public UpdateRunListeningValidator()
    {
        RuleFor(x => x.Position).GreaterThan(0);
        RuleFor(x => x.ListenedSeconds).GreaterThan(0);
    }
}

public static class UpdateRunListeningEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(UpdateRunListening request, PlayableRun? loaded)
    {
        var problem = RunSessionAccess.Check(loaded, request.Position);
        if (!ReferenceEquals(problem, WolverineContinue.NoProblems))
            return problem;
        var listen = loaded!.Session.ListenSecondsOf(loaded.Challenge.Rules);
        return request.ListenedSeconds > listen ? RunsProblems.ListenedTooLong(listen) : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>PATCH /api/runs/sessions/{id}/listening</c> : note l'écoute du morceau en cours (le serveur garde le maximum). L'écoute est fixe (règles de
    /// la playlist) : au-delà, 400. Un autre morceau que le morceau en cours : 409 (<c>runs.already_answered</c>, <c>runs.track_lock_not_released</c>).
    /// </summary>
    [Authorize]
    [WolverinePatch("/api/runs/sessions/{id}/listening", OperationId = "updateRunListening")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [EmptyResponse]
    public static void Patch(UpdateRunListening request, PlayableRun loaded)
    {
        var session = loaded.Session;
        session.KeepRound(session.RoundOfCurrentTrack().Listen(request.ListenedSeconds));
    }
}

/// <summary>Le premier son du morceau en cours vient de sortir : le chrono part.</summary>
public sealed record StartRunClock(int Position);

public sealed class StartRunClockValidator : AbstractValidator<StartRunClock>
{
    public StartRunClockValidator()
    {
        RuleFor(x => x.Position).GreaterThan(0);
    }
}

public static class StartRunClockEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(StartRunClock request, PlayableRun? loaded) => RunSessionAccess.Check(loaded, request.Position);

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/clock</c> : le navigateur annonce le premier son du morceau en cours (événement <c>playing</c>), le chrono
    /// part. Seule la première annonce compte, et elle ne peut pas repousser le départ au-delà d'un court délai après l'envoi de l'extrait (un
    /// navigateur qui n'annonce rien voit le chrono partir à cette limite). Rend ce qui reste au chrono retenu : le navigateur s'y recale (un
    /// joueur resté longtemps sur la réponse d'avant a moins de temps que le chrono plein). Un autre morceau que le morceau en cours : 409.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/clock", OperationId = "startRunClock")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static RunClockResponse Post(StartRunClock request, [NotBody] PlayableRun loaded, TimeProvider time)
    {
        var now = time.GetUtcNow();
        loaded.Session.StartClock(now);
        return new RunClockResponse(loaded.Session.ClockRemaining(loaded.Challenge.Rules, now));
    }
}

public static class RefreshRunPreviewEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(PlayableRun? loaded) => RunSessionAccess.Check(loaded, position: null);

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/preview</c> : redemande l'extrait **du morceau en cours seulement** (les adresses expirent, piège 14 ; Deezer
    /// n'avait pas répondu). Si Deezer confirme qu'il n'a plus d'extrait, le morceau est neutralisé et la réponse passe au suivant.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/preview", OperationId = "refreshRunPreview")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<RunPlayResponse> Post([NotBody] PlayableRun loaded, [NotBody] RunPlayer player, CancellationToken ct) =>
        await player.AdvanceAsync(await player.LoadAsync(loaded.Session, loaded.Challenge, ct), answered: null, revealed: null, isResuming: true, ct);
}

/// <summary>La réponse au morceau en cours : « Artiste - Titre » corrigés séparément. Artiste et titre vides : le joueur passe (0 point).</summary>
public sealed record SubmitRunAnswer(int Position, string? Artist, string? Title);

public sealed class SubmitRunAnswerValidator : AbstractValidator<SubmitRunAnswer>
{
    public SubmitRunAnswerValidator()
    {
        RuleFor(x => x.Position).GreaterThan(0);
        RuleFor(x => x.Artist).MaximumLength(200);
        RuleFor(x => x.Title).MaximumLength(300);
    }
}

public static class SubmitRunAnswerEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(SubmitRunAnswer request, PlayableRun? loaded) => RunSessionAccess.Check(loaded, request.Position);

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/answers</c> : répond au morceau en cours (ou le passe). **Une transaction** : la réponse, les vies, le palier de la
    /// manche suivante, la fin de la partie, le record et le niveau. Rend le morceau révélé et ses points, les scores à jour, le bilan de la manche si elle se termine, le
    /// résultat de fin si la partie se termine, sinon l'extrait du morceau suivant. Une réponse arrivée après le chrono du morceau (règles de la playlist,
    /// marge réseau comprise) est notée comme un morceau passé : 0 point.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/answers", OperationId = "submitRunAnswer")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<RunPlayResponse> Post(
        SubmitRunAnswer request, [NotBody] PlayableRun loaded, [NotBody] RunPlayer player, IAnswerMatcher matcher, TimeProvider time,
        [NotBody] RunsMetrics metrics, ILogger<SubmitRunAnswer> logger, CancellationToken ct)
    {
        var run = await player.LoadAsync(loaded.Session, loaded.Challenge, ct);
        var session = run.Session;
        var track = run.TrackAt(request.Position)!;
        var info = run.InfoAt(request.Position);

        // L'écoute est fixe : la durée annoncée est toujours celle du palier de la manche, le plancher d'écoute ne peut pas la dépasser
        // (PATCH …/listening).
        var outcome = session.RoundOfCurrentTrack()
            .Answer(session.ListenSecondsOf(run.Challenge.Rules), request.Artist, request.Title, new TrackNames(info.Artist, info.Title, info.AltTitles), matcher)
            .Outcome!;
        var step = session.Answer(run.Challenge, outcome, player.Scoring, time.GetUtcNow());
        var revealed = RunViews.Revealed(run, request.Position);
        RunsLog.AnswerSubmitted(
            logger, session.PlayerId, session.Id, track.TrackId, track.Position, track.Round, outcome.ArtistCorrect, outcome.TitleCorrect,
            revealed.Points);
        metrics.AnswerSubmitted(outcome, track.Round);

        return await player.AdvanceAsync(run, step, revealed, isResuming: false, ct);
    }
}

/// <summary>Le thème choisi pour la manche à venir ; <c>themeId</c> vide : le thème mystère.</summary>
public sealed record ChooseRunTheme(int Round, int? ThemeId);

public sealed class ChooseRunThemeValidator : AbstractValidator<ChooseRunTheme>
{
    public ChooseRunThemeValidator() => RuleFor(x => x.Round).GreaterThan(0);
}

/// <summary>La partie, et l'offre de thèmes qu'elle peut encore voir (vide quand le choix est fermé).</summary>
public sealed record RunThemeChoiceLoad(PlayableRun? Loaded, RunThemeOffer? Offer);

public static class ChooseRunThemeEndpoint
{
    public static async Task<RunThemeChoiceLoad> LoadAsync(
        int id, ICurrentPlayer current, IRunsStore store, RunRoundDealer dealer, CancellationToken ct)
    {
        var loaded = await RunSessionAccess.LoadAsync(id, current, store, ct);
        RunThemeOffer? offer = null;
        if (loaded is not null && loaded.Session.IsPending)
            offer = await dealer.OfferAsync(loaded.Challenge, loaded.Challenge.Rules.RoundOf(loaded.Session.NextPosition), ct);
        return new RunThemeChoiceLoad(loaded, offer);
    }

    public static ProblemDetails Validate(ChooseRunTheme request, RunThemeChoiceLoad load)
    {
        var problem = RunSessionAccess.Check(load.Loaded, position: null);
        if (!ReferenceEquals(problem, WolverineContinue.NoProblems))
            return problem;
        if (load.Offer is null || load.Offer.Round != request.Round)
            return RunsProblems.ThemeLocked();
        return request.ThemeId is { } themeId && load.Offer.Themes.All(t => t.Id != themeId) ? RunsProblems.ThemeNotOffered() : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/theme</c> : le joueur qui arrive le premier à une manche en choisit le thème, avant son premier son. Les
    /// morceaux de la manche sont alors tirés dans ce thème (le thème mystère quand <c>themeId</c> est vide : un autre thème que les deux proposés),
    /// puis figés pour tous les joueurs de la playlist. La réponse est celle d'un démarrage : l'état à jour et le premier morceau de la manche. 409
    /// <c>runs.theme_locked</c> si la manche n'attend pas de thème (déjà tirée, ou pas la manche à venir) ; 400 pour un thème qui n'est pas proposé.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/theme", OperationId = "chooseRunTheme")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<RunPlayResponse> Post(
        ChooseRunTheme request, [NotBody] RunThemeChoiceLoad load, [NotBody] RunRoundDealer dealer, [NotBody] RunPlayer player,
        ILogger<ChooseRunTheme> logger, CancellationToken ct)
    {
        var (session, challenge) = load.Loaded!;
        await dealer.DealAsync(challenge, request.Round, request.ThemeId, ct);
        RunsLog.ThemeChosen(logger, session.Id, session.PlayerId, request.Round, request.ThemeId is null);
        return await player.AdvanceAsync(await player.LoadAsync(session, challenge, ct), answered: null, revealed: null, isResuming: false, ct);
    }
}

public static class AbandonRunEndpoint
{
    public static Task<PlayableRun?> LoadAsync(int id, ICurrentPlayer current, IRunsStore store, CancellationToken ct) =>
        RunSessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(PlayableRun? loaded) => RunSessionAccess.Check(loaded, position: null);

    /// <summary>
    /// <c>POST /api/runs/sessions/{id}/abandon</c> : le clic sur « Abandonner ». La partie est finie, la playlist ne se rejoue pas, le record n'en
    /// tient pas compte. 409 si elle est déjà finie.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/sessions/{id}/abandon", OperationId = "abandonRun")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [EmptyResponse]
    public static void Post([NotBody] PlayableRun loaded, TimeProvider time, [NotBody] RunsMetrics metrics, ILogger<PlayableRun> logger)
    {
        loaded.Session.Abandon(time.GetUtcNow());
        RunsLog.SessionAbandoned(logger, loaded.Session.Id, loaded.Session.PlayerId);
        metrics.SessionAbandoned();
    }
}
