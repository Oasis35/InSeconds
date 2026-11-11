using InSeconds.Api.Modules.Social.Contracts;

namespace InSeconds.Api.Modules.Social.Domain;

/// <summary>Un membre à classer, avec ce que chaque mode dit de lui (rien : il n'a pas encore joué).</summary>
public sealed record RankingInput(Guid PlayerId, string Pseudo, IReadOnlyList<MemberPerformance> Performances);

/// <summary>Une ligne du classement. <see cref="Rank"/> et <see cref="Performance"/> sont vides pour un membre qui n'a fini aucune partie.</summary>
public sealed record RankingRow(int? Rank, Guid PlayerId, string Pseudo, double? Performance, int GamesPlayed, int? BestScore);

/// <summary>
/// Le classement d'un groupe : la **moyenne des performances** (de 0 à 1) des modes où le membre a joué, la plus haute d'abord ; à égalité, celui qui a
/// le plus de parties, puis l'ordre alphabétique des pseudos. Les ex æquo (même performance, même nombre de parties) partagent un rang (1, 1, 3) ; les
/// membres sans partie finie ferment la liste, sans rang. La règle ne connaît aucun mode : un mode de plus fournit une performance de plus.
/// </summary>
public static class GroupRankingPolicy
{
    /// <summary>La performance est arrondie à 4 décimales : deux membres que 10⁻⁵ sépare sont à égalité.</summary>
    private const int Decimals = 4;

    public static IReadOnlyList<RankingRow> Rank(IEnumerable<RankingInput> members)
    {
        ArgumentNullException.ThrowIfNull(members);
        var scored = new List<(RankingInput Member, double Performance, int Games, int? Best)>();
        var unplayed = new List<RankingInput>();
        foreach (var member in members)
        {
            if (member.Performances.Count == 0)
            {
                unplayed.Add(member);
                continue;
            }

            var performance = Math.Round(member.Performances.Average(p => Math.Clamp(p.Performance, 0d, 1d)), Decimals);
            var best = member.Performances.Where(p => p.BestScore is not null).Select(p => p.BestScore).Max();
            scored.Add((member, performance, member.Performances.Sum(p => p.GamesPlayed), best));
        }

        var rows = new List<RankingRow>();
        var ordered = scored
            .OrderByDescending(s => s.Performance).ThenByDescending(s => s.Games).ThenBy(s => s.Member.Pseudo, StringComparer.OrdinalIgnoreCase)
            .ThenBy(s => s.Member.PlayerId)
            .ToList();
        for (var i = 0; i < ordered.Count; i++)
        {
            var current = ordered[i];
            var tiesPrevious = i > 0 && ordered[i - 1].Performance == current.Performance && ordered[i - 1].Games == current.Games;
            var rank = tiesPrevious ? rows[i - 1].Rank : i + 1;
            rows.Add(new RankingRow(rank, current.Member.PlayerId, current.Member.Pseudo, current.Performance, current.Games, current.Best));
        }

        rows.AddRange(unplayed
            .OrderBy(m => m.Pseudo, StringComparer.OrdinalIgnoreCase).ThenBy(m => m.PlayerId)
            .Select(m => new RankingRow(null, m.PlayerId, m.Pseudo, null, 0, null)));
        return rows;
    }
}
