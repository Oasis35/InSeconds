using InSeconds.Api.Domain;
using InSeconds.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Features.Admin.Tracks.AddTrack;

public sealed class AddTrackHandler(ApplicationDbContext db, DeezerClient deezer)
{
    public async Task<IResult> Handle(AddTrackCommand command, CancellationToken cancellationToken)
    {
        var existing = await db.Tracks
            .FirstOrDefaultAsync(t => t.DeezerTrackId == command.DeezerTrackId, cancellationToken);

        if (existing is not null)
        {
            if (!string.IsNullOrEmpty(existing.Artist) && !string.IsNullOrEmpty(existing.Title))
                return Results.Ok(new AddTrackResponse(existing.Id, existing.Artist, existing.Title, existing.DeezerTrackId));

            // Données incomplètes en base — re-fetch Deezer pour corriger
            var fixProbe = await deezer.GetTrackInfoAsync(command.DeezerTrackId, cancellationToken);
            if (fixProbe.Info is { } fix)
            {
                existing.Artist      = fix.Artist;
                existing.Title       = fix.Title;
                existing.CoverHash   = fix.CoverHash;
                existing.ReleaseYear = fix.ReleaseYear;
                await db.SaveChangesAsync(cancellationToken);
            }
            return Results.Ok(new AddTrackResponse(existing.Id, existing.Artist, existing.Title, existing.DeezerTrackId));
        }

        var probe = await deezer.GetTrackInfoAsync(command.DeezerTrackId, cancellationToken);
        if (!probe.Succeeded)
            return Results.Json(new { error = "deezer_unavailable", message = "Deezer momentanément indisponible, réessaie." }, statusCode: StatusCodes.Status503ServiceUnavailable);
        if (probe.Info is null)
            return Results.UnprocessableEntity(new { error = "invalid_track", message = $"Track Deezer introuvable : {command.DeezerTrackId}." });

        var info = probe.Info;
        var track = new Track
        {
            DeezerTrackId = command.DeezerTrackId,
            Artist        = info.Artist,
            Title         = info.Title,
            CoverHash     = info.CoverHash,
            ReleaseYear   = info.ReleaseYear,
            HasPreview    = !string.IsNullOrEmpty(info.PreviewUrl),
            CreatedAt     = DateTime.UtcNow,
        };
        db.Tracks.Add(track);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // Race condition : un autre appel concurrent a inséré le même DeezerTrackId entre le FirstOrDefault et le SaveChanges.
            db.Entry(track).State = EntityState.Detached;
            var race = await db.Tracks.FirstAsync(t => t.DeezerTrackId == command.DeezerTrackId, cancellationToken);
            return Results.Ok(new AddTrackResponse(race.Id, race.Artist, race.Title, race.DeezerTrackId));
        }

        return Results.Ok(new AddTrackResponse(track.Id, track.Artist, track.Title, track.DeezerTrackId));
    }
}
