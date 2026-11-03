namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// La photo des règles d'un run au moment où son défi est créé, rangée en <c>jsonb</c> dans le défi : changer un réglage <c>Runs:</c> à chaud
/// ne modifie jamais un défi déjà créé. Les listes sont des tableaux (le binder de configuration ne mélange rien ici : la photo n'est pas relue
/// depuis les réglages).
/// </summary>
/// <param name="Rounds">Nombre de manches.</param>
/// <param name="TracksPerRound">Morceaux par manche.</param>
/// <param name="ListenSeconds">Durée d'écoute fixe d'un morceau.</param>
/// <param name="ThresholdPercents">Pour chaque manche, la part du maximum de la manche à atteindre pour la passer (une valeur par manche).</param>
/// <param name="MinMultiplier">Multiplicateur de points de la première manche.</param>
/// <param name="MaxMultiplier">Multiplicateur de points de la dernière manche.</param>
/// <param name="AnswerSeconds">
/// Le chrono d'un morceau, du premier son à la réponse (écoute et réécoutes comprises) ; 0 : pas de chrono (les playlists créées avant lui, dont la
/// photo n'a pas ce champ).
/// </param>
public sealed record RunRules(
    int Rounds, int TracksPerRound, decimal ListenSeconds, IReadOnlyList<int> ThresholdPercents, decimal MinMultiplier, decimal MaxMultiplier,
    int AnswerSeconds = 0)
{
    /// <summary>Le morceau a un chrono.</summary>
    public bool HasClock => AnswerSeconds > 0;

    /// <summary>Les morceaux d'un défi.</summary>
    public int TrackCount => Rounds * TracksPerRound;

    /// <summary>
    /// Le multiplicateur de la manche <paramref name="round"/> (à partir de 1) : de <see cref="MinMultiplier"/> à <see cref="MaxMultiplier"/>,
    /// par interpolation linéaire, arrondi à deux décimales (la colonne est <c>numeric(3,2)</c>). Une seule manche : le minimum.
    /// </summary>
    public decimal MultiplierOf(int round)
    {
        if (round < 1 || round > Rounds)
            throw new ArgumentOutOfRangeException(nameof(round));
        if (Rounds == 1)
            return MinMultiplier;
        return decimal.Round(MinMultiplier + (MaxMultiplier - MinMultiplier) * (round - 1) / (Rounds - 1), 2, MidpointRounding.AwayFromZero);
    }
}
