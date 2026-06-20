using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.AbandonSession;

public sealed class AbandonSessionHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(AbandonSessionCommand command, CancellationToken cancellationToken)
    {
        var session = await db.GameSessions
            .FirstOrDefaultAsync(s => s.Id == command.SessionId, cancellationToken);

        if (session is null)
            return Results.NotFound(new { error = "session_not_found", message = "Session introuvable." });

        if (session.PlayerId != command.PlayerId)
            return Results.StatusCode(403);

        if (session.Status == SessionStatus.Completed)
            return Results.BadRequest(new { error = "already_completed", message = "Impossible d'abandonner une session terminée." });

        if (session.Status == SessionStatus.Abandoned)
            return Results.BadRequest(new { error = "already_abandoned", message = "Session déjà abandonnée." });

        session.Status      = SessionStatus.Abandoned;
        session.AbandonedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }
}
