using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.StartSession;

public sealed class StartSessionHandler(ApplicationDbContext db, DeezerClient deezer)
{
    public async Task<IResult> Handle(StartSessionCommand command, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var challenge = await db.DailyChallenges
            .Include(c => c.Tracks)
                .ThenInclude(t => t.Track)
            .FirstOrDefaultAsync(c => c.Date == today, cancellationToken);

        if (challenge is null)
        {
            return Results.Problem(
                detail: "Aucun défi disponible pour aujourd'hui.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var alreadyPlayed = await db.GameSessions
            .AnyAsync(s => s.PlayerId == command.PlayerId && s.DailyChallengeId == challenge.Id, cancellationToken);

        if (alreadyPlayed)
        {
            return Results.Conflict(new
            {
                error   = "already_played",
                message = "Vous avez déjà joué le défi du jour.",
            });
        }

        var session = new GameSession
        {
            PlayerId             = command.PlayerId,
            DailyChallengeId     = challenge.Id,
            TotalScore           = 0,
            TotalDurationSeconds = 0,
            CreatedAt            = DateTime.UtcNow,
        };
        db.GameSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);

        // Récupérer les URLs de preview fraîches depuis Deezer en parallèle
        var orderedTracks = challenge.Tracks.OrderBy(t => t.Position).ToList();
        var previewUrls = await Task.WhenAll(
            orderedTracks.Select(t => deezer.GetPreviewUrlAsync(t.Track.DeezerTrackId, cancellationToken)));

        var tracks = orderedTracks
            .Select((t, i) => new TrackSlot(
                Id:         t.Id,
                Position:   t.Position,
                PreviewUrl: previewUrls[i] ?? string.Empty))
            .ToList();

        return Results.Ok(new StartSessionResponse(SessionId: session.Id, Tracks: tracks));
    }
}
