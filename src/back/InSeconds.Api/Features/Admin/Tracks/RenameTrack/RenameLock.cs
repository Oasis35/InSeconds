using System.Linq.Expressions;
using InSeconds.Api.Domain;

namespace InSeconds.Api.Features.Admin.Tracks.RenameTrack;

// Quand un morceau n'est pas renommable : Artist/Title sont la référence de correction des
// réponses (SubmitAnswer), les changer pendant qu'une partie qui le contient peut encore
// recevoir des réponses la corrigerait avec deux noms différents. C'est le cas du défi du jour,
// et du défi de la veille tant qu'une session y est encore Pending (partie commencée avant
// minuit, qui accepte encore des réponses jusqu'à son expiration paresseuse).
// Règle partagée entre RenameTrack (409) et GetTracks (bouton ✎ désactivé).
public static class RenameLock
{
    public static Expression<Func<DailyChallengeTrack, bool>> Locks(DateOnly today)
    {
        var yesterday = today.AddDays(-1);
        return dct => dct.DailyChallenge.Date == today
            || (dct.DailyChallenge.Date == yesterday
                && dct.DailyChallenge.GameSessions.Any(s => s.Status == SessionStatus.Pending));
    }
}
