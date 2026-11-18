using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un morceau jouable, tel que le tirage le voit : son identifiant, son rang Deezer (vide s'il n'a jamais été lu) et ses thèmes (vide : aucun).</summary>
public sealed record RankedTrack(int Id, int? DeezerRank, IReadOnlyList<int>? ThemeIds = null);

/// <summary>Choisit les morceaux d'une manche. Une autre mesure de notoriété (taux de réussite réel…) est une autre implémentation.</summary>
public interface IRunTrackSelector
{
    /// <summary>
    /// Les morceaux de la manche <paramref name="round"/>, dans l'ordre du jeu ; moins que <see cref="RunRules.TracksPerRound"/> (jusqu'à aucun) si le
    /// pool ne suffit pas.
    /// </summary>
    /// <param name="used">Les morceaux déjà tirés pour ce défi : jamais deux fois le même (sauf pool épuisé).</param>
    /// <param name="themeId">Le thème de la manche : seuls les morceaux qui l'ont sont tirés ; vide, tout le catalogue.</param>
    /// <param name="avoidRecentFirst">
    /// Les morceaux que le joueur a entendu récemment, du plus récent au plus ancien (<see cref="RunDiversity"/>) : une préférence, jamais un blocage.
    /// Ils ne sont tirés que si la tranche ne suffit pas sans eux, les plus anciens d'abord.
    /// </param>
    IReadOnlyList<int> SelectRound(
        IReadOnlyCollection<RankedTrack> candidates, RunRules rules, int seed, int round, IReadOnlySet<int> used, int? themeId,
        IReadOnlyList<int>? avoidRecentFirst = null);
}

/// <summary>
/// La notoriété par le rang Deezer : les morceaux jouables (Daily compris) sont triés du plus connu au moins connu et coupés en tranches ; la manche
/// <c>k</c> tire ses morceaux dans la tranche <c>k</c> (la manche 1 : les plus connus), la dernière tranche se répétant au-delà. Les candidats sont
/// d'abord triés (rang, puis identifiant) : le tirage ne dépend ni de l'ordre rendu par la base, ni d'un doublon, seulement du pool, des morceaux déjà
/// tirés et de la graine. Une tranche épuisée se complète avec les morceaux restants les moins connus d'abord, puis les plus connus.
/// </summary>
public sealed class RankBandSelector(ISeededShuffle shuffle) : IRunTrackSelector
{
    public IReadOnlyList<int> SelectRound(
        IReadOnlyCollection<RankedTrack> candidates, RunRules rules, int seed, int round, IReadOnlySet<int> used, int? themeId,
        IReadOnlyList<int>? avoidRecentFirst = null)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        ArgumentNullException.ThrowIfNull(rules);
        ArgumentNullException.ThrowIfNull(used);

        var sorted = candidates
            .GroupBy(t => t.Id).Select(g => g.First())
            .Where(t => RunThemes.Matches(themeId, t.ThemeIds))
            .OrderByDescending(t => t.DeezerRank ?? int.MinValue).ThenBy(t => t.Id)
            .Select(t => t.Id)
            .ToList();
        var wanted = rules.TracksPerRound;
        var free = sorted.Where(id => !used.Contains(id)).ToList();
        // Pool épuisé : mieux vaut rejouer un morceau que d'arrêter la Série (rare : il faut des centaines de manches).
        if (free.Count < wanted)
            free = sorted;
        if (free.Count == 0)
            return [];

        // Des tranches assez larges pour une manche, calculées sur tout le pool filtré (une tranche ne glisse pas quand des morceaux sont déjà tirés).
        var bands = Math.Max(1, Math.Min(rules.RankBands, sorted.Count / wanted));
        var band = Math.Min(round, bands) - 1;
        var start = (int)((long)sorted.Count * band / bands);
        var end = (int)((long)sorted.Count * (band + 1) / bands);
        var freeSet = free.ToHashSet();
        var inBand = sorted.Skip(start).Take(end - start).Where(freeSet.Contains).ToList();
        // Diversité : les morceaux entendus récemment passent après les autres, les plus anciens d'abord (jamais de blocage).
        var avoided = (avoidRecentFirst ?? []).Where(freeSet.Contains).Distinct().ToList();
        var avoidedSet = avoided.ToHashSet();
        var inBandSet = inBand.ToHashSet();
        var fresh = inBand.Where(id => !avoidedSet.Contains(id)).ToList();
        var picked = shuffle.Shuffle(fresh, unchecked(seed + round)).Take(wanted).ToList();
        if (picked.Count < wanted)
            picked.AddRange(Enumerable.Reverse(avoided).Where(inBandSet.Contains).Take(wanted - picked.Count));
        if (picked.Count < wanted)
        {
            // Complète avec les moins connus (après la tranche), puis les plus connus (avant).
            var pickedSet = picked.ToHashSet();
            var rest = sorted.Skip(end).Concat(sorted.Take(start).Reverse()).Where(id => freeSet.Contains(id) && !pickedSet.Contains(id)).ToList();
            picked.AddRange(rest.Where(id => !avoidedSet.Contains(id)).Take(wanted - picked.Count));
            if (picked.Count < wanted)
            {
                var restSet = rest.ToHashSet();
                picked.AddRange(Enumerable.Reverse(avoided).Where(id => restSet.Contains(id) && !picked.Contains(id)).Take(wanted - picked.Count));
            }
        }

        return picked;
    }
}
