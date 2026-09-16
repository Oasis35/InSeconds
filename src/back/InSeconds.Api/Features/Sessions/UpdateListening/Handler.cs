using InSeconds.Api.Common.Sessions;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;

namespace InSeconds.Api.Features.Sessions.UpdateListening;

public sealed class UpdateListeningHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(UpdateListeningCommand command, CancellationToken cancellationToken)
    {
        var (session, failure) = await db.LoadOwnedSessionAsync(command.SessionId, command.PlayerId, cancellationToken);

        if (failure == SessionLookupFailure.NotFound)
            return Results.NotFound(new { error = "session_not_found" });

        if (failure == SessionLookupFailure.WrongPlayer)
            return Results.StatusCode(403);

        if (session!.Status != SessionStatus.Pending)
            return Results.BadRequest(new { error = "session_not_pending" });

        session.UpdateTrackLock(command.TrackId, command.ListenedSeconds);

        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }
}
