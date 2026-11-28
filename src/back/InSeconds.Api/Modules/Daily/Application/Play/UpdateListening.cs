using FluentValidation;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
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

    public static ProblemDetails Validate(UpdateListening request, PlayableSession? loaded, IGameCalendar calendar) =>
        SessionAccess.Check(loaded, request.Position, calendar.Today);

    /// <summary>
    /// <c>PATCH /api/daily/sessions/{id}/listening</c> : note le palier écouté sur le morceau en cours. C'est ce qui pose le **plancher
    /// d'écoute** (le serveur garde le maximum, jamais ce que le client annonce plus tard). Un autre morceau que
    /// le morceau en cours : 409 (<c>daily.already_answered</c>, <c>daily.track_lock_not_released</c> : piège 35, le verrou ne se déplace pas).
    /// </summary>
    [Authorize]
    [WolverinePatch("/api/daily/sessions/{id}/listening", OperationId = "updateListening")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [EmptyResponse]
    public static void Patch(UpdateListening request, PlayableSession loaded)
    {
        var session = loaded.Session;
        session.KeepRound(session.RoundOfCurrentTrack().Listen(request.ListenedSeconds));
    }
}

public static class AbandonSessionEndpoint
{
    public static Task<PlayableSession?> LoadAsync(int id, ICurrentPlayer current, IDailyStore store, CancellationToken ct) =>
        SessionAccess.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(PlayableSession? loaded, IGameCalendar calendar) => SessionAccess.Check(loaded, position: null, calendar.Today);

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
    public static void Post([NotBody] PlayableSession loaded, TimeProvider time, [NotBody] DailyMetrics metrics, ILogger<PlayableSession> logger)
    {
        loaded.Session.Abandon(time.GetUtcNow());
        DailyLog.SessionAbandoned(logger, loaded.Session.Id, loaded.Session.PlayerId);
        metrics.SessionAbandoned();
    }
}
