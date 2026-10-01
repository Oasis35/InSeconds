using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.RenameTrack;

// Corrige l'artiste/le titre d'un morceau (faute, nom Deezer peu reconnaissable…), qu'il ait
// déjà été utilisé ou non, défi du jour compris. Ces champs sont la référence de correction des
// réponses (SubmitAnswer) : les réponses déjà enregistrées gardent leur verdict, les suivantes
// sont corrigées avec le nouveau nom. Le contrôle de doublon (DeezerTrackId) n'est pas touché.
public sealed class RenameTrackHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(RenameTrackCommand command, CancellationToken cancellationToken)
    {
        var track = await db.Tracks
            .FirstOrDefaultAsync(t => t.Id == command.TrackId, cancellationToken);

        if (track is null)
            return Results.NotFound(new { error = "not_found", message = "Morceau introuvable." });

        track.Artist    = command.Artist.Trim();
        track.Title     = command.Title.Trim();
        track.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new RenameTrackResponse(track.Id, track.Artist, track.Title));
    }
}
