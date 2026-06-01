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

        var tracks = new List<Track>();
        foreach (var deezerTrackId in command.DeezerTrackIds)
        {
            var existing = await db.Tracks
                .FirstOrDefaultAsync(t => t.DeezerTrackId == deezerTrackId, cancellationToken);

            if (existing is not null)
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
                Artist = info.Artist,
                Title = info.Title,
                CreatedAt = DateTime.UtcNow,
            };
            db.Tracks.Add(newTrack);
            await db.SaveChangesAsync(cancellationToken);
            tracks.Add(newTrack);
        }

        var challenge = new DailyChallenge
        {
            Date = command.Date,
            Seed = command.Date.DayNumber,
        };
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync(cancellationToken);

        db.DailyChallengeTracks.AddRange(tracks.Select((t, i) => new DailyChallengeTrack
        {
            DailyChallengeId = challenge.Id,
            TrackId = t.Id,
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
