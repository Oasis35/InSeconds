using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un morceau jouable, tel que le tirage le voit : son identifiant, son rang Deezer (vide s'il n'a jamais été lu) et ses thèmes (vide : aucun).</summary>
public sealed record RankedTrack(int Id, int? DeezerRank, IReadOnlyList<int>? ThemeIds = null);

/// <summary>Le résultat d'un tirage.</summary>
/// <param name="Tracks">Les morceaux tirés dans l'ordre du jeu (manche par manche) ; vide si le pool est insuffisant.</param>
/// <param name="EligibleCount">Combien de morceaux pouvaient être tirés.</param>
/// <param name="Requested">Combien le défi en demande.</param>
/// <param name="Reserve">Les morceaux de réserve de chaque manche (Échange), tirés après ceux de la manche dans sa tranche, autant que la tranche le permet.</param>
public sealed record RunSelection(IReadOnlyList<PlannedTrack> Tracks, int EligibleCount, int Requested, IReadOnlyList<PlannedTrack>? Reserve = null)
{
    public bool IsSufficient => EligibleCount >= Requested;
}

/// <summary>Choisit les morceaux d'un défi. Une autre difficulté (taux de réussite réel, thèmes) est une autre implémentation.</summary>
public interface IRunTrackSelector
{
    RunSelection Select(IReadOnlyCollection<RankedTrack> candidates, RunRules rules, int seed);
}

/// <summary>
/// La difficulté par le rang Deezer : tout le catalogue jouable (Daily compris) trié du plus connu au moins connu, coupé en autant de tranches que
/// de manches ; la manche <c>k</c> tire ses morceaux dans la tranche <c>k</c> (manche 1 = les plus connus). Un morceau sans rang est dans la tranche
/// la moins connue. Le multiplicateur de points croît avec la manche (<see cref="RunRules.MultiplierOf"/>). Les candidats sont d'abord triés
/// (rang, puis identifiant) : le tirage ne dépend ni de l'ordre rendu par la base, ni d'un doublon, seulement du pool et de la graine. La réserve
/// d'une manche (<see cref="RunRules.ReservePerRound"/>) suit ses morceaux dans le même mélange de sa tranche : une petite tranche en donne moins,
/// jamais au détriment des morceaux de la manche (le pool demandé reste celui des morceaux joués). Une manche à thème (<see cref="RunRules.Themes"/>) tire ses morceaux parmi ceux qui portent son thème, avant les tranches, qui se partagent le reste du pool.
/// </summary>
public sealed class RankBandSelector(ISeededShuffle shuffle) : IRunTrackSelector
{
    public RunSelection Select(IReadOnlyCollection<RankedTrack> candidates, RunRules rules, int seed)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        ArgumentNullException.ThrowIfNull(rules);

        var all = candidates.GroupBy(t => t.Id).Select(g => g.First()).ToList();
        var requested = rules.TrackCount;
        // Chaque tranche reçoit au moins ⌊n ÷ manches⌋ morceaux : assez pour toutes dès que n ≥ manches × morceaux par manche.
        if (all.Count < requested)
            return new RunSelection([], all.Count, requested);

        // Les manches à thème d'abord : leurs morceaux sont retirés du pool des tranches (aucun morceau deux fois). Un thème qui ne suffit plus
        // à sa manche la rend à sa tranche.
        var themed = new Dictionary<int, List<int>>();
        var taken = new HashSet<int>();
        foreach (var theme in (rules.Themes ?? []).OrderBy(t => t.Round))
        {
            var pool = all.Where(t => !taken.Contains(t.Id) && RunThemes.Matches(theme.ThemeId, t.ThemeIds))
                .OrderByDescending(t => t.DeezerRank ?? int.MinValue).ThenBy(t => t.Id).Select(t => t.Id).ToList();
            if (pool.Count < rules.TracksPerRound)
                continue;
            var shuffledTheme = shuffle.Shuffle(pool, unchecked(seed + theme.Round)).Take(rules.TracksPerRound + rules.ReservePerRound).ToList();
            themed[theme.Round] = shuffledTheme;
            taken.UnionWith(shuffledTheme);
        }

        var sorted = all
            .Where(t => !taken.Contains(t.Id))
            .OrderByDescending(t => t.DeezerRank ?? int.MinValue).ThenBy(t => t.Id)
            .Select(t => t.Id)
            .ToList();
        var bandRounds = Enumerable.Range(1, rules.Rounds).Where(r => !themed.ContainsKey(r)).ToList();
        if (bandRounds.Count > 0 && sorted.Count < bandRounds.Count * rules.TracksPerRound)
            return new RunSelection([], sorted.Count + themed.Count * rules.TracksPerRound, requested);

        var planned = new List<PlannedTrack>(requested);
        var reserve = new List<PlannedTrack>();
        for (var round = 1; round <= rules.Rounds; round++)
        {
            var multiplier = rules.MultiplierOf(round);
            List<int> shuffled;
            if (themed.TryGetValue(round, out var themedTracks))
            {
                shuffled = themedTracks;
            }
            else
            {
                var index = bandRounds.IndexOf(round);
                var start = (int)((long)sorted.Count * index / bandRounds.Count);
                var end = (int)((long)sorted.Count * (index + 1) / bandRounds.Count);
                shuffled = [.. shuffle.Shuffle(sorted.Skip(start).Take(end - start), unchecked(seed + round))];
            }

            planned.AddRange(shuffled.Take(rules.TracksPerRound).Select(id => new PlannedTrack(id, round, multiplier)));
            reserve.AddRange(shuffled.Skip(rules.TracksPerRound).Take(rules.ReservePerRound).Select(id => new PlannedTrack(id, round, multiplier)));
        }

        return new RunSelection(planned, all.Count, requested, reserve);
    }
}
