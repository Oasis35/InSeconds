using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.GetTracks;

public sealed class GetTracksHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(CancellationToken cancellationToken)
    {
        var allTracks = await db.Tracks
            .AsNoTracking()
            .OrderBy(t => t.Artist)
            .Select(t => new
            {
                t.Id,
                t.Artist,
                t.Title,
                t.DeezerTrackId,
                t.HasPreview,
                IsUsed = t.DailyChallengeTracks.Any(),
            })
            .ToListAsync(cancellationToken);

        var available = allTracks
            .Where(t => !t.IsUsed)
            .Select(t => new TrackDto(t.Id, t.Artist, t.Title, t.DeezerTrackId, HasPreview: t.HasPreview))
            .ToList();

        var used = allTracks
            .Where(t => t.IsUsed)
            .Select(t => new TrackDto(t.Id, t.Artist, t.Title, t.DeezerTrackId))
            .ToList();

        return Results.Ok(new GetTracksResponse(available, used));
    }
}
