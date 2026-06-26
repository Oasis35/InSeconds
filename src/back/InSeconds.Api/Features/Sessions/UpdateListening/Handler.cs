using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.UpdateListening;

public sealed class UpdateListeningHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(UpdateListeningCommand command, CancellationToken cancellationToken)
    {
        var session = await db.GameSessions
            .FirstOrDefaultAsync(s => s.Id == command.SessionId, cancellationToken);

        if (session is null)
            return Results.NotFound(new { error = "session_not_found" });

        if (session.PlayerId != command.PlayerId)
            return Results.StatusCode(403);

        if (session.Status != SessionStatus.Pending)
            return Results.BadRequest(new { error = "session_not_pending" });

        // Mettre à jour uniquement si on écoute la même track ou si c'est une nouvelle track
        // Prendre le max pour ne jamais réduire le minimum
        if (session.CurrentTrackId == command.TrackId)
        {
            if (command.ListenedSeconds > (session.CurrentTrackMinListenedSeconds ?? 0))
                session.CurrentTrackMinListenedSeconds = command.ListenedSeconds;
        }
        else
        {
            session.CurrentTrackId = command.TrackId;
            session.CurrentTrackMinListenedSeconds = command.ListenedSeconds;
        }

        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }
}
