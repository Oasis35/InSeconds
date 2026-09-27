using InSeconds.Api.Common.Sessions;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

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

        // Anti-triche (M1, revue du 25/09) : sans ces deux gardes, un appel direct pouvait
        // déplacer le verrou vers un autre TrackId (arbitraire, pas forcément dans ce défi)
        // pour repartir avec CurrentTrackMinListenedSeconds/CurrentTrackHintLevelUsed à zéro,
        // puis soumettre le vrai morceau écouté (avec indices) sans que SubmitAnswer applique
        // ni le plancher de durée ni la pénalité d'indice (session.CurrentTrackId ne pointait
        // plus dessus).

        // Le TrackId doit appartenir à ce défi.
        var trackExists = await db.DailyChallengeTracks
            .AnyAsync(t => t.Id == command.TrackId && t.DailyChallengeId == session.DailyChallengeId, cancellationToken);
        if (!trackExists)
            return Results.NotFound(new { error = "track_not_found" });

        // Le verrou ne peut être déplacé vers un autre morceau que si le morceau actuellement
        // verrouillé a déjà été répondu (ce qui l'aurait libéré via ReleaseTrackLock côté
        // SubmitAnswer) — jamais en cours de route.
        if (session.CurrentTrackId is { } lockedTrackId && lockedTrackId != command.TrackId)
            return Results.Conflict(new { error = "track_lock_not_released", message = "Le morceau en cours n'a pas encore été répondu." });

        session.UpdateTrackLock(command.TrackId, command.ListenedSeconds);

        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }
}
