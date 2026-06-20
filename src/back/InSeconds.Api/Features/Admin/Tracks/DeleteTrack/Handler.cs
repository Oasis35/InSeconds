using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.DeleteTrack;

public sealed class DeleteTrackHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(DeleteTrackCommand command, CancellationToken cancellationToken)
    {
        var track = await db.Tracks
            .FirstOrDefaultAsync(t => t.Id == command.TrackId, cancellationToken);

        if (track is null)
            return Results.NotFound(new { error = "not_found", message = "Morceau introuvable." });

        var isUsed = await db.DailyChallengeTracks
            .AnyAsync(dct => dct.TrackId == command.TrackId, cancellationToken);

        if (isUsed)
            return Results.Conflict(new { error = "track_in_use", message = "Ce morceau est utilisé dans un défi et ne peut pas être supprimé." });

        db.Tracks.Remove(track);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok();
    }
}
