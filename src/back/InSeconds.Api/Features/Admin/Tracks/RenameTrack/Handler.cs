using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.RenameTrack;

// Corrige l'artiste/le titre d'un morceau (faute, nom Deezer peu reconnaissable…), qu'il ait
// déjà été utilisé ou non. Ces champs sont la référence de correction des réponses
// (SubmitAnswer) : bloqué tant qu'une partie qui le contient peut encore recevoir des réponses
// (cf. RenameLock). Le contrôle de doublon (DeezerTrackId) n'est pas touché.
public sealed class RenameTrackHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(RenameTrackCommand command, CancellationToken cancellationToken)
    {
        var track = await db.Tracks
            .FirstOrDefaultAsync(t => t.Id == command.TrackId, cancellationToken);

        if (track is null)
            return Results.NotFound(new { error = "not_found", message = "Morceau introuvable." });

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var locked = await db.DailyChallengeTracks
            .Where(dct => dct.TrackId == command.TrackId)
            .AnyAsync(RenameLock.Locks(today), cancellationToken);

        if (locked)
            return Results.Conflict(new { error = "track_locked", message = "Ce morceau est dans une partie encore en cours : modifiable à partir de demain." });

        track.Artist    = command.Artist.Trim();
        track.Title     = command.Title.Trim();
        track.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new RenameTrackResponse(track.Id, track.Artist, track.Title));
    }
}
