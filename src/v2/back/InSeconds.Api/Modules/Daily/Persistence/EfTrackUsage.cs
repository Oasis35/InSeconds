using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>
/// L'usage des morceaux par le jeu, **calculé** sur <c>challenge_tracks</c> et <c>challenges.date</c> (§ 4.4 du plan v2) :
/// rien n'est stocké sur le morceau, donc rien à garder cohérent. Remplace <c>NoTrackUsage</c> de Catalogue.
/// </summary>
public sealed class EfTrackUsage(InSecondsDbContext db, IOptionsMonitor<DailyOptions> options, IGameCalendar calendar) : ITrackUsage
{
    public async Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var ids = trackIds.Distinct().ToArray();
        var today = calendar.Today;
        var cooldown = options.CurrentValue.TrackCooldownDays;

        var rows = await Appearances()
            .Where(a => ids.Contains(a.TrackId))
            .GroupBy(a => a.TrackId)
            .Select(g => new { TrackId = g.Key, Last = g.Max(a => a.Date), Count = g.Count(), InToday = g.Any(a => a.Date == today) })
            .ToListAsync(ct);

        return rows.ToDictionary(r => r.TrackId, r => new TrackUsage(r.Last, r.Count, r.Last.AddDays(cooldown), r.InToday));
    }

    public async Task<IReadOnlySet<int>> GetTracksInCooldownAsync(DateOnly day, CancellationToken ct)
    {
        // Règle de la v1 (`LastUsedDate < jour - cooldown` pour être tirable) : tiré à une date >= jour - cooldown, un
        // morceau reste exclu. Il redevient donc tirable le lendemain du jour affiché comme `UnlockDate` (dernier usage +
        // cooldown), un écart d'un jour que la v1 avait déjà : les deux sont gardés tels quels.
        var from = day.AddDays(-options.CurrentValue.TrackCooldownDays);
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
