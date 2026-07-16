using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.StartSession;

public sealed class StartSessionHandler(
    ApplicationDbContext db,
    CachedDeezerClient deezer,
    SettingsService settingsService,
    DailyChallengeGenerator challengeGenerator,
    ILogger<StartSessionHandler> logger)
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

        if (expiredSessions.Count > 0)
            await db.SaveChangesAsync(cancellationToken);

        var challenge = await LoadTodayChallengeAsync(today, cancellationToken)
                        ?? await TryLazyGenerateAsync(today, cancellationToken);

        if (challenge is null)
        {
            return Results.Problem(
                detail: "Aucun défi disponible pour aujourd'hui.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        // Chercher une session existante pour ce joueur + ce défi
        var existingSession = await db.GameSessions
            .Where(s => s.PlayerId == command.PlayerId && s.DailyChallengeId == challenge.Id)
            .Select(s => new
            {
                s.Id,
                s.Status,
                s.CurrentTrackId,
                s.CurrentTrackMinListenedSeconds,
                Answers = s.Answers.Select(a => new
                {
                    a.ArtistCorrect,
                    a.TitleCorrect,
                    a.Score,
                    a.ListenedDurationSeconds,
                    TrackPosition = a.Track.Position,
                    TrackArtist   = a.Track.Track.Artist,
                    TrackTitle    = a.Track.Track.Title,
                }).ToList()
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (existingSession is not null)
        {
            if (existingSession.Status == SessionStatus.Completed)
                return Results.Conflict(new { error = "already_played", message = "Vous avez déjà joué le défi du jour." });

            if (existingSession.Status == SessionStatus.Abandoned)
                return Results.Conflict(new { error = "abandoned", message = "Vous avez abandonné le défi du jour." });

            // Session Pending → retourner les données de reprise
            var appSettingsResume = await settingsService.GetAsync(cancellationToken);
            var orderedTracksResume = challenge.Tracks.OrderBy(t => t.Position).ToList();
            var previewUrlsResume = await Task.WhenAll(
                orderedTracksResume.Select(t => deezer.GetPreviewUrlAsync(t.DeezerTrackId, cancellationToken)));

            var tracksResume = orderedTracksResume
                .Select((t, i) => new TrackSlot(
                    Id:            t.Id,
                    Position:      t.Position,
                    PreviewUrl:    previewUrlsResume[i] ?? string.Empty,
                    CoverUrl:      t.CoverHash is not null ? appSettingsResume.BuildCoverUrl(t.CoverHash) : null,
                    DeezerTrackId: t.DeezerTrackId))
                .ToList();

            var answeredPositions = existingSession.Answers
                .Select(a => a.TrackPosition)
                .ToHashSet();

            var completedAnswers = existingSession.Answers
                .OrderBy(a => a.TrackPosition)
                .Select(a => new ResumedAnswer(
                    Position:                a.TrackPosition,
                    ArtistCorrect:           a.ArtistCorrect,
                    TitleCorrect:            a.TitleCorrect,
                    Score:                   a.Score,
                    ListenedDurationSeconds: a.ListenedDurationSeconds,
                    CorrectArtist:           a.TrackArtist,
                    CorrectTitle:            a.TrackTitle))
                .ToList();

            // Index 0-based de la première track sans réponse
            var resumeFromPosition = orderedTracksResume
                .Select((t, i) => (t, i))
                .Where(x => !answeredPositions.Contains(x.t.Position))
                .Select(x => x.i)
                .DefaultIfEmpty(orderedTracksResume.Count)
                .First();

            var playerResume = await db.Players.AsNoTracking().FirstAsync(p => p.Id == command.PlayerId, cancellationToken);

            return Results.Ok(new StartSessionResponse(
                SessionId:          existingSession.Id,
                Tracks:             tracksResume,
                CurrentStreak:      playerResume.CurrentStreak,
                IsResuming:         true,
                ResumeFromPosition: resumeFromPosition,
                CompletedAnswers:   completedAnswers,
                CurrentTrackId:     existingSession.CurrentTrackId,
                MinListenedSeconds: existingSession.CurrentTrackMinListenedSeconds));
        }

        // Nouvelle session
        var player = await db.Players.AsNoTracking().FirstAsync(p => p.Id == command.PlayerId, cancellationToken);

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
            orderedTracks.Select(t => deezer.GetPreviewUrlAsync(t.DeezerTrackId, cancellationToken)));

        var appSettings = await settingsService.GetAsync(cancellationToken);

        var tracks = orderedTracks
            .Select((t, i) => new TrackSlot(
                Id:            t.Id,
                Position:      t.Position,
                PreviewUrl:    previewUrls[i] ?? string.Empty,
                CoverUrl:      t.CoverHash is not null ? appSettings.BuildCoverUrl(t.CoverHash) : null,
                DeezerTrackId: t.DeezerTrackId))
            .ToList();

        return Results.Ok(new StartSessionResponse(
            SessionId:          session.Id,
            Tracks:             tracks,
            CurrentStreak:      player.CurrentStreak,
            IsResuming:         false,
            ResumeFromPosition: 0,
            CompletedAnswers:   []));
    }

    private Task<ChallengeProjection?> LoadTodayChallengeAsync(DateOnly today, CancellationToken ct)
        => db.DailyChallenges
            .AsNoTracking()
            .Where(c => c.Date == today)
            .Select(c => new ChallengeProjection(
                c.Id,
                c.Tracks.Select(t => new ChallengeTrackProjection(
                    t.Id,
                    t.Position,
                    t.Track.DeezerTrackId,
                    t.Track.CoverHash)).ToList()))
            .FirstOrDefaultAsync(ct);

    // Filet de sécurité : si le job de minuit a raté (cf. piège 19 — réveil anticipé,
    // crash, redéploiement…), le premier joueur qui arrive régénère le défi du jour.
    // La sélection est déterministe (seed = today.DayNumber), donc identique à celle
    // que le scheduler aurait produite.
    private async Task<ChallengeProjection?> TryLazyGenerateAsync(DateOnly today, CancellationToken ct)
    {
        try
        {
            logger.LogWarning("Aucun défi pour le {Date} au moment du StartSession — génération paresseuse.", today);
            var result = await challengeGenerator.GenerateAsync(ct);
            if (result == GenerateResult.PoolInsufficient)
                return null;
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            // Course possible avec le scheduler ou un autre joueur (contrainte unique
            // sur Date) : on repart d'un contexte propre et on relit — si le défi vient
            // d'être créé par quelqu'un d'autre, la relecture le trouve. Les sessions
            // expirées non sauvées seront re-expirées au prochain StartSession.
            db.ChangeTracker.Clear();
            logger.LogError(ex, "Échec de la génération paresseuse du défi du {Date}.", today);
        }

        return await LoadTodayChallengeAsync(today, ct);
    }

    private sealed record ChallengeTrackProjection(int Id, int Position, long DeezerTrackId, string? CoverHash);
    private sealed record ChallengeProjection(int Id, List<ChallengeTrackProjection> Tracks);
}
