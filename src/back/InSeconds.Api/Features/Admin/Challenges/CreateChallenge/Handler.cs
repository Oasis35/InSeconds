using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Challenges.GetChallenges;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Challenges.CreateChallenge;

public sealed class CreateChallengeHandler(ApplicationDbContext db, DeezerClient deezer)
{
    public async Task<IResult> Handle(CreateChallengeCommand command, CancellationToken cancellationToken)
    {
        var exists = await db.DailyChallenges
            .AnyAsync(c => c.Date == command.Date, cancellationToken);

        if (exists)
            return Results.Conflict(new { error = "date_taken", message = $"Un défi existe déjà pour le {command.Date:yyyy-MM-dd}." });

        var existingTracks = await db.Tracks
            .Where(t => command.DeezerTrackIds.Contains(t.DeezerTrackId))
            .ToDictionaryAsync(t => t.DeezerTrackId, cancellationToken);

        var tracks = new List<Track>();
        foreach (var deezerTrackId in command.DeezerTrackIds)
        {
            if (existingTracks.TryGetValue(deezerTrackId, out var existing))
            {
                tracks.Add(existing);
                continue;
            }

            var info = await deezer.GetTrackInfoAsync(deezerTrackId, cancellationToken);
            if (info is null)
                return Results.UnprocessableEntity(new { error = "invalid_track", message = $"Track Deezer introuvable : {deezerTrackId}." });

            var newTrack = new Track
            {
                DeezerTrackId = deezerTrackId,
                Artist        = info.Artist,
                Title         = info.Title,
                CoverHash     = info.CoverHash,
                HasPreview    = !string.IsNullOrEmpty(info.PreviewUrl),
                CreatedAt     = DateTime.UtcNow,
            };
            db.Tracks.Add(newTrack);
            tracks.Add(newTrack);
        }

        var challenge = new DailyChallenge
        {
            Date = command.Date,
            Seed = command.Date.DayNumber,
        };
        db.DailyChallenges.Add(challenge);

        db.DailyChallengeTracks.AddRange(tracks.Select((t, i) => new DailyChallengeTrack
        {
            DailyChallenge = challenge,
            Track = t,
            Position = i + 1,
            DeezerRankSnapshot = i + 1,
        }));
        await db.SaveChangesAsync(cancellationToken);

        var dto = new ChallengeDto(
            challenge.Id,
            challenge.Date,
            tracks.Select((t, i) => new TrackDto(i + 1, t.Artist, t.Title, t.DeezerTrackId)).ToList());

        return Results.Ok(dto);
    }
}
