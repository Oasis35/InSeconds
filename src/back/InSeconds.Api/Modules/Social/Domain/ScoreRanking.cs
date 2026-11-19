namespace InSeconds.Api.Modules.Social.Domain;

/// <summary>Un membre à classer sur une période : son score, vide s'il n'en a pas (pas joué, ou score que le joueur qui regarde ne voit pas encore).</summary>
public sealed record ScoreInput(Guid PlayerId, string Pseudo, int? Score);

/// <summary>Une ligne d'un classement par score. <see cref="Rank"/> et <see cref="Score"/> sont vides pour un membre sans score.</summary>
public sealed record ScoreRow(int? Rank, Guid PlayerId, string Pseudo, int? Score);

/// <summary>
/// Le classement d'un groupe sur une période (le jour, la semaine) : le score le plus haut d'abord ; les ex æquo partagent un rang (1, 1, 3) et se
/// rangent par pseudo ; les membres sans score ferment la liste, sans rang. La règle ne connaît aucun mode.
/// </summary>
public static class ScoreRankingPolicy
{
    public static IReadOnlyList<ScoreRow> Rank(IEnumerable<ScoreInput> members)
    {
        ArgumentNullException.ThrowIfNull(members);
        var list = members.ToList();
        var scored = list.Where(m => m.Score is not null)
            .OrderByDescending(m => m.Score).ThenBy(m => m.Pseudo, StringComparer.OrdinalIgnoreCase).ThenBy(m => m.PlayerId)
            .ToList();
        var rows = new List<ScoreRow>(list.Count);
        for (var i = 0; i < scored.Count; i++)
        {
            var rank = i > 0 && scored[i - 1].Score == scored[i].Score ? rows[i - 1].Rank : i + 1;
            rows.Add(new ScoreRow(rank, scored[i].PlayerId, scored[i].Pseudo, scored[i].Score));
        }

        rows.AddRange(list.Where(m => m.Score is null)
            .OrderBy(m => m.Pseudo, StringComparer.OrdinalIgnoreCase).ThenBy(m => m.PlayerId)
            .Select(m => new ScoreRow(null, m.PlayerId, m.Pseudo, null)));
        return rows;
    }
}
