using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Tracks.SetTrackDisabled;

// Retire un morceau du tirage des prochains défis (ou l'y remet), sans le supprimer : c'est
// l'alternative à la suppression pour un morceau déjà utilisé (DeleteTrack renvoie 409).
// Le morceau reste dans le pool ; les défis déjà générés ne changent pas. Interdit (409) de
// désactiver un morceau du défi du jour : l'admin croirait l'avoir retiré alors qu'il est joué
// aujourd'hui. La réactivation, elle, est toujours permise.
// Filtré par DailyChallengeGenerator et ignoré par PreviewStatusRefresher.
public sealed class SetTrackDisabledHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(SetTrackDisabledCommand command, CancellationToken cancellationToken)
    {
        var track = await db.Tracks
            .FirstOrDefaultAsync(t => t.Id == command.TrackId, cancellationToken);

        if (track is null)
            return Results.NotFound(new { error = "not_found", message = "Morceau introuvable." });

        if (command.IsDisabled && !track.IsDisabled)
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var inTodayChallenge = await db.DailyChallengeTracks
                .AnyAsync(dct => dct.TrackId == command.TrackId && dct.DailyChallenge.Date == today, cancellationToken);

            if (inTodayChallenge)
                return Results.Conflict(new { error = "track_in_today_challenge", message = "Ce morceau est dans le défi du jour : désactivable à partir de demain." });
        }

        if (track.IsDisabled != command.IsDisabled)
        {
            track.IsDisabled = command.IsDisabled;
            track.UpdatedAt  = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(new SetTrackDisabledResponse(track.Id, track.IsDisabled));
    }
}
