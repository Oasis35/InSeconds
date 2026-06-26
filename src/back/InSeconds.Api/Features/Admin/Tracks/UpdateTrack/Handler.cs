using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.UpdateTrack;

public sealed class UpdateTrackHandler(ApplicationDbContext db, DeezerClient deezer)
{
    public async Task<IResult> Handle(UpdateTrackCommand command, CancellationToken cancellationToken)
    {
        var track = await db.Tracks
            .FirstOrDefaultAsync(t => t.Id == command.TrackId, cancellationToken);

        if (track is null)
            return Results.NotFound(new { error = "not_found", message = "Morceau introuvable." });

        var isUsed = await db.DailyChallengeTracks
            .AnyAsync(dct => dct.TrackId == command.TrackId, cancellationToken);

        if (isUsed)
            return Results.Conflict(new { error = "track_in_use", message = "Ce morceau est utilisé dans un défi et ne peut pas être modifié." });

        if (track.DeezerTrackId != command.NewDeezerTrackId)
        {
            var conflict = await db.Tracks
                .AnyAsync(t => t.DeezerTrackId == command.NewDeezerTrackId && t.Id != command.TrackId, cancellationToken);

            if (conflict)
                return Results.Conflict(new { error = "deezer_id_taken", message = "Ce DeezerTrackId est déjà utilisé par un autre morceau." });
        }

        var info = await deezer.GetTrackInfoAsync(command.NewDeezerTrackId, cancellationToken);
        if (info is null)
            return Results.UnprocessableEntity(new { error = "invalid_track", message = $"Track Deezer introuvable : {command.NewDeezerTrackId}." });

        track.DeezerTrackId = command.NewDeezerTrackId;
        track.Artist        = info.Artist;
        track.Title         = info.Title;
        track.CoverHash     = info.CoverHash;
        track.HasPreview    = !string.IsNullOrEmpty(info.PreviewUrl);

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new UpdateTrackResponse(track.Id, track.Artist, track.Title, track.DeezerTrackId));
    }
}
