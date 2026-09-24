using InSeconds.Api.Common.Observability;
using InSeconds.Api.Common.Sessions;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.RequestHint;

public sealed class RequestHintHandler(ApplicationDbContext db, SettingsService settingsService, ILogger<RequestHintHandler> logger)
{
    public async Task<IResult> Handle(RequestHintCommand command, CancellationToken cancellationToken)
    {
        var (session, failure) = await db.LoadOwnedSessionAsync(command.SessionId, command.PlayerId, cancellationToken);

        if (failure == SessionLookupFailure.NotFound)
            return Results.NotFound(new { error = "session_not_found" });

        if (failure == SessionLookupFailure.WrongPlayer)
            return Results.StatusCode(403);

        if (session!.Status != SessionStatus.Pending)
            return Results.BadRequest(new { error = "session_not_pending" });

        if (session.CurrentTrackId != command.DailyChallengeTrackId)
            return Results.BadRequest(new { error = "track_not_current", message = "Ce morceau n'est pas celui en cours d'écoute." });

        var settings = await settingsService.GetAsync(cancellationToken);
        var thresholds = settings.HintUnlockDurationsSeconds;
        var threshold = thresholds[command.Level - 1];

        if ((session.CurrentTrackMinListenedSeconds ?? 0) < threshold)
            return Results.Conflict(new { error = "hint_not_unlocked", message = $"Indice niveau {command.Level} débloqué à {threshold}s d'écoute." });

        var challengeTrack = await db.DailyChallengeTracks
            .Where(t => t.Id == command.DailyChallengeTrackId && t.DailyChallengeId == session.DailyChallengeId)
            .Select(t => new { t.Track.Artist, t.Track.ReleaseYear })
            .FirstOrDefaultAsync(cancellationToken);

        if (challengeTrack is null)
            return Results.NotFound(new { error = "track_not_found", message = "Track introuvable dans ce défi." });

        session.RecordHintUsage(command.DailyChallengeTrackId, command.Level);

        await db.SaveChangesAsync(cancellationToken);

        PlayerActionLog.HintRequested(logger, command.Level, command.PlayerId, command.SessionId, command.DailyChallengeTrackId);

        // Cumulatif : le niveau 2 renvoie aussi l'année (niveau 1), que le joueur l'ait
        // révélée séparément avant ou non.
        var artistMasked = command.Level >= 2
            ? TextNormalizationHelpers.BuildHangmanPattern(challengeTrack.Artist)
            : null;

        return Results.Ok(new RequestHintResponse(challengeTrack.ReleaseYear, artistMasked));
    }
}
