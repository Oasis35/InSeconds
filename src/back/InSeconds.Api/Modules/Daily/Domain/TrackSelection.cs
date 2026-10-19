using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Le résultat d'un tirage de morceaux.</summary>
/// <param name="TrackIds">Les morceaux tirés, dans l'ordre du défi ; vide si le pool est insuffisant.</param>
/// <param name="EligibleCount">Combien de morceaux pouvaient être tirés (jouables, hors cooldown).</param>
/// <param name="Requested">Combien le défi en demande.</param>
public sealed record TrackSelection(IReadOnlyList<int> TrackIds, int EligibleCount, int Requested)
{
    public bool IsSufficient => EligibleCount >= Requested;
}

/// <summary>Choisit les morceaux d'un défi (§ 5.3 du plan v2). Un mode de plus peut avoir sa propre règle.</summary>
public interface ITrackSelector
{
    /// <param name="candidates">Les morceaux jouables.</param>
    /// <param name="inCooldown">Ceux qu'un défi de ce jour ne peut pas tirer (utilisés trop récemment).</param>
    /// <param name="count">Le nombre de morceaux du défi.</param>
    /// <param name="seed">La graine du tirage : la même donne toujours le même défi.</param>
    TrackSelection Select(IEnumerable<int> candidates, IReadOnlySet<int> inCooldown, int count, int seed);
}

/// <summary>
/// Le tirage du défi du jour : retire les morceaux en cooldown, puis un Fisher-Yates à graine (<see cref="ISeededShuffle"/>,
/// même algorithme que la v1). Les candidats sont d'abord triés par identifiant : **le défi ne dépend ni de l'ordre
/// dans lequel la base les rend, ni de leur éventuelle répétition**, seulement du pool et de la graine.
/// </summary>
public sealed class CooldownSeededSelector(ISeededShuffle shuffle) : ITrackSelector
{
    public TrackSelection Select(IEnumerable<int> candidates, IReadOnlySet<int> inCooldown, int count, int seed)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(count);

        var eligible = candidates.Where(id => !inCooldown.Contains(id)).Distinct().Order().ToList();
        if (eligible.Count < count)
            return new TrackSelection([], eligible.Count, count);

        return new TrackSelection([.. shuffle.Shuffle(eligible, seed).Take(count)], eligible.Count, count);
    }
}
