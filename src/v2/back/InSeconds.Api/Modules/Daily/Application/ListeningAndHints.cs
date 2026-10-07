using FluentValidation;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Le joueur a écouté ce palier sur ce morceau.</summary>
public sealed record UpdateListening(int Position, decimal ListenedSeconds);

public sealed class UpdateListeningValidator : AbstractValidator<UpdateListening>
{
    public UpdateListeningValidator(DailyRules rules)
    {
        RuleFor(x => x.Position).GreaterThan(0);
        // Lus à chaque appel : un palier ajouté ou retiré dans les réglages s'applique sans redémarrer.
        RuleFor(x => x.ListenedSeconds)
            .Must(rules.IsAllowedDuration)
            .WithMessage("La durée doit être l'un des paliers autorisés.");
    }
}

public static class UpdateListeningEndpoint
{
    public static Task<PlayableSession?> LoadAsync(int id, ICurrentPlayer current, IDailyStore store, CancellationToken ct) =>
        SessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(UpdateListening request, PlayableSession? loaded) => SessionAccess.Check(loaded, request.Position);

    /// <summary>
    /// <c>PATCH /api/daily/sessions/{id}/listening</c> : note le palier écouté sur le morceau en cours. C'est ce qui pose le **plancher
    /// d'écoute** (le serveur garde le maximum, jamais ce que le client annonce plus tard) et débloque les indices. Un autre morceau que
    /// le morceau en cours : 409 (<c>daily.already_answered</c>, <c>daily.track_lock_not_released</c> : piège 35, le verrou ne se déplace pas).
    /// </summary>
    [Authorize]
    [WolverinePatch("/api/daily/sessions/{id}/listening", OperationId = "updateListening")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [EmptyResponse]
    public static void Patch(UpdateListening request, PlayableSession loaded, DailyRules rules)
    {
        var session = loaded.Session;
        session.KeepRound(session.RoundOfCurrentTrack(rules.Hints).Listen(request.ListenedSeconds));
    }
}

/// <summary>Le joueur demande l'indice de ce niveau sur ce morceau.</summary>
public sealed record RequestHint(int Position, int Level);

public sealed class RequestHintValidator : AbstractValidator<RequestHint>
{
    public RequestHintValidator(DailyRules rules)
    {
        RuleFor(x => x.Position).GreaterThan(0);
        RuleFor(x => x.Level)
            .Must(level => level >= 1 && level <= rules.HintLevels.Count)
            .WithMessage("Ce niveau d'indice n'existe pas.");
    }
}

/// <summary>Ce que révèlent les indices jusqu'au niveau demandé (cumulatif : le niveau 2 rend aussi l'année).</summary>
public sealed record HintResponse(IReadOnlyList<HintFactResponse> Facts);

public static class RequestHintEndpoint
{
    public static Task<PlayableSession?> LoadAsync(int id, ICurrentPlayer current, IDailyStore store, CancellationToken ct) =>
        SessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(RequestHint request, PlayableSession? loaded, DailyRules rules)
    {
        var problem = SessionAccess.Check(loaded, request.Position);
        if (loaded is null || !ReferenceEquals(problem, WolverineContinue.NoProblems))
            return problem;

        // Le niveau ne se débloque que si la durée **vue par le serveur** (pas annoncée par le client) atteint son seuil.
        var reveal = loaded.Session.RoundOfCurrentTrack(rules.Hints).RevealHint(request.Level, rules.Hints);
        return reveal.Refusal switch
        {
            null => WolverineContinue.NoProblems,
            HintRefusal.NotUnlocked => DailyProblems.HintLocked(reveal.UnlocksAtSeconds!.Value),
            _ => DailyProblems.HintLocked(0),
        };
    }

    /// <summary>
    /// <c>POST /api/daily/sessions/{id}/hints</c> : révèle l'indice d'un niveau. Le niveau révélé est gardé par la partie (jamais envoyé par le
    /// client à la réponse) : c'est lui qui fait payer la pénalité. 409 <c>daily.hint_locked</c> tant que le palier écouté n'atteint pas le seuil.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/daily/sessions/{id}/hints", OperationId = "requestHint")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<HintResponse> Post(
        RequestHint request,
        PlayableSession loaded,
        ITrackDirectory directory,
        DailyRules rules,
        ILogger<HintResponse> logger,
        CancellationToken ct)
    {
        var session = loaded.Session;
        var round = session.RoundOfCurrentTrack(rules.Hints).RevealHint(request.Level, rules.Hints).Round!;
        session.KeepRound(round);

        var trackId = loaded.TrackAt(request.Position)!.TrackId;
        var info = (await directory.GetAsync([trackId], ct))[trackId];
        var facts = HintFacts.UpTo(request.Level, rules.HintProviders, new HintSubject(info.Artist, info.Title, (short?)info.ReleaseYear))
            .Select(f => new HintFactResponse(HintLevelInfo.KindNameOf(f.Kind), f.Value))
            .ToList();

        DailyLog.HintRequested(logger, request.Level, session.PlayerId, session.Id, request.Position);
        return new HintResponse(facts);
    }
}

public static class AbandonSessionEndpoint
{
    public static Task<PlayableSession?> LoadAsync(int id, ICurrentPlayer current, IDailyStore store, CancellationToken ct) =>
        SessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(PlayableSession? loaded) => SessionAccess.Check(loaded, position: null);

    /// <summary>
    /// <c>POST /api/daily/sessions/{id}/abandon</c> : le clic explicite sur « Abandonner ». La partie est perdue pour la journée (elle ne se
    /// rejoue pas). 409 si elle est déjà terminée ou abandonnée.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/daily/sessions/{id}/abandon", OperationId = "abandonSession")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [EmptyResponse]
    public static void Post([NotBody] PlayableSession loaded, TimeProvider time, ILogger<PlayableSession> logger)
    {
        loaded.Session.Abandon(time.GetUtcNow());
        DailyLog.SessionAbandoned(logger, loaded.Session.Id, loaded.Session.PlayerId);
    }
}
