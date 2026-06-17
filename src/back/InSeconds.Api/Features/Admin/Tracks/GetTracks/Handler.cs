using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.GetTracks;

public sealed class GetTracksHandler(ApplicationDbContext db, DeezerClient deezer)
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

        var availableTracks = allTracks.Where(t => !usedTrackIds.Contains(t.Id)).ToList();

        var previewChecks = await Task.WhenAll(
            availableTracks.Select(t => deezer.GetPreviewUrlAsync(t.DeezerTrackId, cancellationToken)));

        var available = availableTracks
            .Select((t, i) => new TrackDto(t.Id, t.Artist, t.Title, t.DeezerTrackId,
                HasPreview: !string.IsNullOrEmpty(previewChecks[i])))
            .ToList();

        var used = allTracks
            .Where(t => usedTrackIds.Contains(t.Id))
            .Select(t => new TrackDto(t.Id, t.Artist, t.Title, t.DeezerTrackId))
            .ToList();

        return Results.Ok(new GetTracksResponse(available, used));
    }
}
