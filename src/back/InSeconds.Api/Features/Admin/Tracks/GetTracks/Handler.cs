using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.GetTracks;

public sealed class GetTracksHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(CancellationToken cancellationToken)
    {
        var usedTrackIds = await db.DailyChallengeTracks
            .Select(dct => dct.TrackId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var allTracks = await db.Tracks
            .OrderBy(t => t.Artist)
            .ToListAsync(cancellationToken);

        var available = allTracks
            .Where(t => !usedTrackIds.Contains(t.Id))
            .Select(t => new TrackDto(t.Id, t.Artist, t.Title, t.DeezerTrackId))
            .ToList();

        var used = allTracks
            .Where(t => usedTrackIds.Contains(t.Id))
            .Select(t => new TrackDto(t.Id, t.Artist, t.Title, t.DeezerTrackId))
            .ToList();

        return Results.Ok(new GetTracksResponse(available, used));
    }
}
