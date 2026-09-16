using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Deezer;
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

        await ExpireStaleSessionsAsync(command.PlayerId, today, cancellationToken);

        var challenge = await LoadTodayChallengeAsync(today, cancellationToken)
                        ?? await TryLazyGenerateAsync(today, cancellationToken);

        if (challenge is null)
        {
            return Results.Problem(
                detail: "Aucun défi disponible pour aujourd'hui.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var existingSession = await LoadExistingSessionAsync(command.PlayerId, challenge.Id, cancellationToken);

        if (existingSession is not null)
        {
            if (existingSession.Status == SessionStatus.Completed)
                return Results.Conflict(new { error = "already_played", message = "Vous avez déjà joué le défi du jour." });

            if (existingSession.Status is SessionStatus.Abandoned or SessionStatus.Expired)
                return Results.Conflict(new { error = "abandoned", message = "Vous avez abandonné le défi du jour." });

            return await BuildResumeResponseAsync(existingSession, challenge, command.PlayerId, cancellationToken);
        }

        return await BuildNewSessionResponseAsync(challenge, command.PlayerId, cancellationToken);
    }

    // Expirer les sessions Pending des jours précédents (timeout paresseux). Expired (pas
    // Abandoned) : le joueur n'a pas cliqué « Abandonner », il a simplement quitté sans
    // terminer — les stats admin distinguent les deux.
    private async Task ExpireStaleSessionsAsync(Guid playerId, DateOnly today, CancellationToken ct)
    {
        var expiredSessions = await db.GameSessions
            .Where(s => s.PlayerId == playerId
                     && s.Status == SessionStatus.Pending
                     && s.DailyChallenge.Date < today)
            .ToListAsync(ct);

        foreach (var expired in expiredSessions)
            expired.Expire(DateTime.UtcNow);

        if (expiredSessions.Count > 0)
            await db.SaveChangesAsync(ct);
    }

    private Task<ExistingSessionProjection?> LoadExistingSessionAsync(Guid playerId, int challengeId, CancellationToken ct)
        => db.GameSessions
            .Where(s => s.PlayerId == playerId && s.DailyChallengeId == challengeId)
            .Select(s => new ExistingSessionProjection(
                s.Id,
                s.Status,
                s.CurrentTrackId,
                s.CurrentTrackMinListenedSeconds,
                s.Answers.Select(a => new ExistingAnswerProjection(
                    a.ArtistCorrect,
                    a.TitleCorrect,
                    a.Score,
                    a.ListenedDurationSeconds,
                    a.Track.Position,
                    a.Track.Track.Artist,
                    a.Track.Track.Title)).ToList()))
            .FirstOrDefaultAsync(ct);

    private async Task<IResult> BuildResumeResponseAsync(
        ExistingSessionProjection existingSession, ChallengeProjection challenge, Guid playerId, CancellationToken ct)
    {
        var appSettings = await settingsService.GetAsync(ct);
        var orderedTracks = challenge.Tracks.OrderBy(t => t.Position).ToList();
        var previewUrls = await Task.WhenAll(
            orderedTracks.Select(t => deezer.GetPreviewUrlAsync(t.DeezerTrackId, ct)));

        var tracks = orderedTracks
            .Select((t, i) => new TrackSlot(
                Id:            t.Id,
                Position:      t.Position,
                PreviewUrl:    previewUrls[i] ?? string.Empty,
                CoverUrl:      t.CoverHash is not null ? appSettings.BuildCoverUrl(t.CoverHash) : null,
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
                CorrectTitle:            TextNormalizationHelpers.CleanDisplayTitle(a.TrackTitle)))
            .ToList();

        // Index 0-based de la première track sans réponse
        var resumeFromPosition = orderedTracks
            .Select((t, i) => (t, i))
            .Where(x => !answeredPositions.Contains(x.t.Position))
            .Select(x => x.i)
            .DefaultIfEmpty(orderedTracks.Count)
            .First();

        var player = await db.Players.AsNoTracking().FirstAsync(p => p.Id == playerId, ct);

        return Results.Ok(new StartSessionResponse(
            SessionId:          existingSession.Id,
            Tracks:             tracks,
            CurrentStreak:      player.CurrentStreak,
            IsResuming:         true,
            ResumeFromPosition: resumeFromPosition,
            CompletedAnswers:   completedAnswers,
            CurrentTrackId:     existingSession.CurrentTrackId,
            MinListenedSeconds: existingSession.CurrentTrackMinListenedSeconds));
    }

    private async Task<IResult> BuildNewSessionResponseAsync(ChallengeProjection challenge, Guid playerId, CancellationToken ct)
    {
        var player = await db.Players.AsNoTracking().FirstAsync(p => p.Id == playerId, ct);

        var session = GameSession.StartNew(playerId, challenge.Id, DateTime.UtcNow);
        db.GameSessions.Add(session);
        await db.SaveChangesAsync(ct);

        var orderedTracks = challenge.Tracks.OrderBy(t => t.Position).ToList();
        var previewUrls = await Task.WhenAll(
            orderedTracks.Select(t => deezer.GetPreviewUrlAsync(t.DeezerTrackId, ct)));

        var appSettings = await settingsService.GetAsync(ct);

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

    private sealed record ExistingAnswerProjection(
        bool ArtistCorrect, bool TitleCorrect, int Score, decimal ListenedDurationSeconds,
        int TrackPosition, string TrackArtist, string TrackTitle);

    private sealed record ExistingSessionProjection(
        int Id, SessionStatus Status, int? CurrentTrackId, decimal? CurrentTrackMinListenedSeconds,
        List<ExistingAnswerProjection> Answers);
}
