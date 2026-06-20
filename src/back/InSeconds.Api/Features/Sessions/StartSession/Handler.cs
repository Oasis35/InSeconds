using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.StartSession;

public sealed class StartSessionHandler(ApplicationDbContext db, DeezerClient deezer, SettingsService settingsService)
{
    public async Task<IResult> Handle(StartSessionCommand command, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Expirer les sessions Pending des jours précédents (timeout paresseux)
        var expiredSessions = await db.GameSessions
            .Where(s => s.PlayerId == command.PlayerId
                     && s.Status == SessionStatus.Pending
                     && s.DailyChallenge.Date < today)
            .ToListAsync(cancellationToken);

        foreach (var expired in expiredSessions)
        {
            expired.Status      = SessionStatus.Abandoned;
            expired.AbandonedAt = DateTime.UtcNow;
        }

        var challenge = await db.DailyChallenges
            .Include(c => c.Tracks)
                .ThenInclude(t => t.Track)
            .FirstOrDefaultAsync(c => c.Date == today, cancellationToken);

        if (challenge is null)
        {
            if (expiredSessions.Count > 0)
                await db.SaveChangesAsync(cancellationToken);

            return Results.Problem(
                detail: "Aucun défi disponible pour aujourd'hui.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        // Chercher une session existante pour ce joueur + ce défi
        var existingSession = await db.GameSessions
            .Include(s => s.Answers)
                .ThenInclude(a => a.Track)
            .FirstOrDefaultAsync(s => s.PlayerId == command.PlayerId && s.DailyChallengeId == challenge.Id, cancellationToken);

        if (existingSession is not null)
        {
            if (existingSession.Status == SessionStatus.Completed)
            {
                if (expiredSessions.Count > 0)
                    await db.SaveChangesAsync(cancellationToken);
                return Results.Conflict(new { error = "already_played", message = "Vous avez déjà joué le défi du jour." });
            }

            if (existingSession.Status == SessionStatus.Abandoned)
            {
                if (expiredSessions.Count > 0)
                    await db.SaveChangesAsync(cancellationToken);
                return Results.Conflict(new { error = "abandoned", message = "Vous avez abandonné le défi du jour." });
            }

            // Session Pending → retourner les données de reprise
            if (expiredSessions.Count > 0)
                await db.SaveChangesAsync(cancellationToken);

            var appSettingsResume = await settingsService.GetAsync(cancellationToken);
            var orderedTracksResume = challenge.Tracks.OrderBy(t => t.Position).ToList();
            var previewUrlsResume = await Task.WhenAll(
                orderedTracksResume.Select(t => deezer.GetPreviewUrlAsync(t.Track.DeezerTrackId, cancellationToken)));

            var tracksResume = orderedTracksResume
                .Select((t, i) => new TrackSlot(
                    Id:            t.Id,
                    Position:      t.Position,
                    PreviewUrl:    previewUrlsResume[i] ?? string.Empty,
                    CoverUrl:      t.Track.CoverHash is not null ? appSettingsResume.BuildCoverUrl(t.Track.CoverHash) : null,
                    DeezerTrackId: t.Track.DeezerTrackId))
                .ToList();

            var answeredPositions = existingSession.Answers
                .Select(a => a.Track.Position)
                .ToHashSet();

            var completedAnswers = existingSession.Answers
                .OrderBy(a => a.Track.Position)
                .Select(a => new ResumedAnswer(
                    Position:                a.Track.Position,
                    ArtistCorrect:           a.ArtistCorrect,
                    TitleCorrect:            a.TitleCorrect,
                    Score:                   a.Score,
                    ListenedDurationSeconds: a.ListenedDurationSeconds))
                .ToList();

            // Index 0-based de la première track sans réponse
            var resumeFromPosition = orderedTracksResume
                .Select((t, i) => (t, i))
                .Where(x => !answeredPositions.Contains(x.t.Position))
                .Select(x => x.i)
                .DefaultIfEmpty(orderedTracksResume.Count)
                .First();

            var playerResume = await db.Players.FirstAsync(p => p.Id == command.PlayerId, cancellationToken);

            return Results.Ok(new StartSessionResponse(
                SessionId:          existingSession.Id,
                Tracks:             tracksResume,
                CurrentStreak:      playerResume.CurrentStreak,
                IsResuming:         true,
                ResumeFromPosition: resumeFromPosition,
                CompletedAnswers:   completedAnswers));
        }

        // Nouvelle session
        var player = await db.Players.FirstAsync(p => p.Id == command.PlayerId, cancellationToken);

        var session = new GameSession
        {
            PlayerId             = command.PlayerId,
            DailyChallengeId     = challenge.Id,
            TotalScore           = 0,
            TotalDurationSeconds = 0,
            CreatedAt            = DateTime.UtcNow,
            Status               = SessionStatus.Pending,
        };
        db.GameSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);

        var orderedTracks = challenge.Tracks.OrderBy(t => t.Position).ToList();
        var previewUrls = await Task.WhenAll(
            orderedTracks.Select(t => deezer.GetPreviewUrlAsync(t.Track.DeezerTrackId, cancellationToken)));

        var appSettings = await settingsService.GetAsync(cancellationToken);

        var tracks = orderedTracks
            .Select((t, i) => new TrackSlot(
                Id:            t.Id,
                Position:      t.Position,
                PreviewUrl:    previewUrls[i] ?? string.Empty,
                CoverUrl:      t.Track.CoverHash is not null ? appSettings.BuildCoverUrl(t.Track.CoverHash) : null,
                DeezerTrackId: t.Track.DeezerTrackId))
            .ToList();

        return Results.Ok(new StartSessionResponse(
            SessionId:          session.Id,
            Tracks:             tracks,
            CurrentStreak:      player.CurrentStreak,
            IsResuming:         false,
            ResumeFromPosition: 0,
            CompletedAnswers:   []));
    }
}
