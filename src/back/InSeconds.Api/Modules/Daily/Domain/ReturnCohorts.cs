using InSeconds.Api.Modules.Players.Contracts;

namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Les joueurs d'un groupe (une source d'arrivée, une classe d'appareil, ou tous) et ceux qui sont revenus : un jour après leur création (J+1),
/// ou sept jours après (J+7). Un joueur ne compte dans l'un des deux retours que si ce jour-là est terminé (jamais aujourd'hui) : sinon
/// les derniers arrivés feraient baisser le taux avant d'avoir pu revenir.
/// </summary>
public sealed record CohortRow(string Key, int New, int Day1Eligible, int Day1Returned, int Day7Eligible, int Day7Returned);

public static class ReturnCohorts
{
    /// <summary>Le groupe de joueurs arrivés, avec leur retour à J+1 et J+7 (<paramref name="played"/> : les jours de défi joués par joueur).</summary>
    public static CohortRow Build(
        string key, IEnumerable<PlayerArrival> arrivals, IReadOnlyDictionary<Guid, IReadOnlyList<DateOnly>> played, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(arrivals);
        ArgumentNullException.ThrowIfNull(played);

        int total = 0, day1Eligible = 0, day1Returned = 0, day7Eligible = 0, day7Returned = 0;
        foreach (var arrival in arrivals)
        {
            total++;
            var days = played.GetValueOrDefault(arrival.PlayerId);
            if (arrival.Day.AddDays(1) < today)
            {
                day1Eligible++;
                if (days is not null && days.Contains(arrival.Day.AddDays(1)))
                    day1Returned++;
            }

            if (arrival.Day.AddDays(7) < today)
            {
                day7Eligible++;
                if (days is not null && days.Contains(arrival.Day.AddDays(7)))
                    day7Returned++;
            }
        }

        return new CohortRow(key, total, day1Eligible, day1Returned, day7Eligible, day7Returned);
    }

    /// <summary>Un groupe par valeur de <paramref name="keyOf"/> (les joueurs sans valeur n'ont pas de groupe), le plus nombreux d'abord.</summary>
    public static IReadOnlyList<CohortRow> By(
        IReadOnlyCollection<PlayerArrival> arrivals, IReadOnlyDictionary<Guid, IReadOnlyList<DateOnly>> played, DateOnly today, Func<PlayerArrival, string?> keyOf)
    {
        ArgumentNullException.ThrowIfNull(arrivals);
        ArgumentNullException.ThrowIfNull(keyOf);
        return arrivals
            .Where(a => keyOf(a) is not null)
            .GroupBy(a => keyOf(a)!)
            .Select(g => Build(g.Key, g, played, today))
            .OrderByDescending(r => r.New).ThenBy(r => r.Key, StringComparer.Ordinal)
            .ToList();
    }
}
