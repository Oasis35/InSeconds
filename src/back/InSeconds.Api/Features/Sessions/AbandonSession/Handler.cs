using InSeconds.Api.Common.Observability;
using InSeconds.Api.Common.Sessions;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;

namespace InSeconds.Api.Features.Sessions.AbandonSession;

public sealed class AbandonSessionHandler(ApplicationDbContext db, ILogger<AbandonSessionHandler> logger)
{
    public async Task<IResult> Handle(AbandonSessionCommand command, CancellationToken cancellationToken)
    {
        var (session, failure) = await db.LoadOwnedSessionAsync(command.SessionId, command.PlayerId, cancellationToken);

        if (failure == SessionLookupFailure.NotFound)
            return Results.NotFound(new { error = "session_not_found", message = "Session introuvable." });

        if (failure == SessionLookupFailure.WrongPlayer)
            return Results.StatusCode(403);

        if (session!.Status == SessionStatus.Completed)
            return Results.BadRequest(new { error = "already_completed", message = "Impossible d'abandonner une session terminée." });

        if (session.Status is SessionStatus.Abandoned or SessionStatus.Expired)
            return Results.BadRequest(new { error = "already_abandoned", message = "Session déjà abandonnée." });

        session.Abandon(DateTime.UtcNow);

        await db.SaveChangesAsync(cancellationToken);

        PlayerActionLog.SessionAbandoned(logger, command.SessionId, command.PlayerId);

        return Results.NoContent();
    }
}
