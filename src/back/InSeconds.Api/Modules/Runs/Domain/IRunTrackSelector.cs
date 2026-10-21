using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un morceau jouable, tel que le tirage le voit : son identifiant et son rang Deezer (vide s'il n'a jamais été lu).</summary>
public sealed record RankedTrack(int Id, int? DeezerRank);

/// <summary>Le résultat d'un tirage.</summary>
/// <param name="Tracks">Les morceaux tirés dans l'ordre du jeu (manche par manche) ; vide si le pool est insuffisant.</param>
/// <param name="EligibleCount">Combien de morceaux pouvaient être tirés.</param>
/// <param name="Requested">Combien le défi en demande.</param>
public sealed record RunSelection(IReadOnlyList<PlannedTrack> Tracks, int EligibleCount, int Requested)
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
/// (rang, puis identifiant) : le tirage ne dépend ni de l'ordre rendu par la base, ni d'un doublon, seulement du pool et de la graine.
/// </summary>
public sealed class RankBandSelector(ISeededShuffle shuffle) : IRunTrackSelector
{
    public RunSelection Select(IReadOnlyCollection<RankedTrack> candidates, RunRules rules, int seed)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        ArgumentNullException.ThrowIfNull(rules);

        var sorted = candidates
            .GroupBy(t => t.Id).Select(g => g.First())
            .OrderByDescending(t => t.DeezerRank ?? int.MinValue).ThenBy(t => t.Id)
            .Select(t => t.Id)
            .ToList();
        var requested = rules.TrackCount;
        // Chaque tranche reçoit au moins ⌊n ÷ manches⌋ morceaux : assez pour toutes dès que n ≥ manches × morceaux par manche.
        if (sorted.Count < requested)
            return new RunSelection([], sorted.Count, requested);

        var planned = new List<PlannedTrack>(requested);
        for (var round = 1; round <= rules.Rounds; round++)
        {
            var start = (int)((long)sorted.Count * (round - 1) / rules.Rounds);
            var end = (int)((long)sorted.Count * round / rules.Rounds);
            var multiplier = rules.MultiplierOf(round);
            planned.AddRange(shuffle.Shuffle(sorted.Skip(start).Take(end - start), unchecked(seed + round))
                .Take(rules.TracksPerRound).Select(id => new PlannedTrack(id, round, multiplier)));
        }

        return new RunSelection(planned, sorted.Count, requested);
    }
}
