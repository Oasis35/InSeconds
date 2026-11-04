using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>
/// L'usage des morceaux par le jeu, **calculé** sur <c>challenge_tracks</c> et <c>challenges.date</c> :
/// rien n'est stocké sur le morceau, donc rien à garder cohérent. C'est l'usage du Daily, que Catalogue réunit à celui des autres modes. Le cooldown se déduit de la
/// taille du pool à chaque appel (<see cref="TrackCooldownPolicy"/>, #275). Les réponses (trouvées ou non) se comptent sur <c>answers</c>.
/// </summary>
public sealed class EfTrackUsage(InSecondsDbContext db, TrackCooldownPolicy cooldown, IGameCalendar calendar) : IDailyTrackUsage
{
    public string Mode => "daily";

    public async Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var ids = trackIds.Distinct().ToArray();
        var today = calendar.Today;
        var cooldownDays = (await cooldown.CurrentAsync(ct)).Days;

        var rows = await Appearances()
            .Where(a => ids.Contains(a.TrackId))
            .GroupBy(a => a.TrackId)
            .Select(g => new { TrackId = g.Key, Last = g.Max(a => a.Date), Count = g.Count(), InToday = g.Any(a => a.Date == today) })
            .ToListAsync(ct);

        var answers = await (from a in db.Set<SessionAnswer>().AsNoTracking()
                             join s in db.Set<DailySession>().AsNoTracking() on a.SessionId equals s.Id
                             join t in db.Set<ChallengeTrack>().AsNoTracking() on new { s.ChallengeId, a.Position } equals new { t.ChallengeId, t.Position }
                             where ids.Contains(t.TrackId)
                             group a by t.TrackId into g
                             select new { TrackId = g.Key, Count = g.Count(), Found = g.Count(a => a.ArtistCorrect || a.TitleCorrect) })
            .ToDictionaryAsync(x => x.TrackId, ct);

        return rows.ToDictionary(r => r.TrackId, r =>
        {
            var answered = answers.GetValueOrDefault(r.TrackId);
            return new TrackUsage(
                r.Last, r.Count, TrackCooldown.UnlockDate(r.Last, cooldownDays), r.InToday,
                AnswerCount: answered?.Count ?? 0, FoundCount: answered?.Found ?? 0);
        });
    }

    public async Task<IReadOnlySet<int>> GetTracksInCooldownAsync(DateOnly day, CancellationToken ct)
    {
        // Tirable si dernier usage < jour - cooldown : tiré à une date >= jour - cooldown, un morceau reste exclu.
        // `UnlockDate` est donc le lendemain de dernier usage + cooldown (#275).
        var from = TrackCooldown.ExcludedFrom(day, (await cooldown.CurrentAsync(ct)).Days);
        var ids = await Appearances()
            .Where(a => a.Date >= from)
            .Select(a => a.TrackId)
            .Distinct()
            .ToListAsync(ct);
        return ids.ToHashSet();
    }

    /// <summary>Chaque apparition d'un morceau : son identifiant et le jour du défi.</summary>
    private IQueryable<Appearance> Appearances() =>
        db.Set<ChallengeTrack>().AsNoTracking()
            .Join(db.Set<DailyChallenge>().AsNoTracking(), t => t.ChallengeId, c => c.Id, (t, c) => new Appearance { TrackId = t.TrackId, Date = c.Date });

    // Initialiseur de membres, pas un record à constructeur : EF ne sait traduire que le premier.
    private sealed class Appearance
    {
        public int TrackId { get; init; }

        public DateOnly Date { get; init; }
    }
}
