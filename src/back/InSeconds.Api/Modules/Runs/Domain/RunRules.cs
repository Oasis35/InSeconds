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
/// <param name="RoundRules">
/// Les difficultés proposées pour chaque manche (proto 2) ; vide pour une playlist du proto 1, dont chaque manche se joue en « Sûre » aux seuils
/// <paramref name="ThresholdPercents"/> et à l'écoute <paramref name="ListenSeconds"/>.
/// </param>
/// <param name="ReservePerRound">Les morceaux de réserve tirés pour chaque manche (le coup de pouce « Joker » change de morceau) ; 0 au proto 1.</param>
public sealed record RunRules(
    int Rounds, int TracksPerRound, decimal ListenSeconds, IReadOnlyList<int> ThresholdPercents, decimal MinMultiplier, decimal MaxMultiplier,
    int AnswerSeconds = 0, IReadOnlyList<RunRoundRules>? RoundRules = null, int ReservePerRound = 0)
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

    /// <summary>
    /// Les difficultés proposées pour la manche <paramref name="round"/> : celles figées dans la playlist, ou, pour une playlist du proto 1, la seule
    /// « Sûre » (son seuil, sans facteur de points, l'écoute des règles).
    /// </summary>
    public IReadOnlyList<RunDifficultyOption> OptionsOf(int round)
    {
        if (round < 1 || round > Rounds)
            throw new ArgumentOutOfRangeException(nameof(round));
        return RoundRules?.FirstOrDefault(r => r.Round == round)?.Options
            ?? [new RunDifficultyOption(RunDifficulty.Safe, 1m, ThresholdPercents[round - 1], ListenSeconds)];
    }

    /// <summary>Le joueur choisit la difficulté de cette manche (plusieurs sont proposées).</summary>
    public bool HasChoice(int round) => OptionsOf(round).Count > 1;

    /// <summary>Cette difficulté, si elle est proposée pour cette manche.</summary>
    public RunDifficultyOption? OptionOf(int round, RunDifficulty difficulty) => OptionsOf(round).FirstOrDefault(o => o.Difficulty == difficulty);

    /// <summary>La difficulté d'une manche que le joueur n'a pas choisie : « Sûre » si elle est proposée, sinon la première.</summary>
    public RunDifficultyOption DefaultOptionOf(int round) => OptionOf(round, RunDifficulty.Safe) ?? OptionsOf(round)[0];

    /// <summary>La plus longue écoute d'un morceau de la playlist, toutes difficultés confondues.</summary>
    public decimal LongestListenSeconds =>
        Enumerable.Range(1, Rounds).SelectMany(OptionsOf).Select(o => o.ListenSeconds).DefaultIfEmpty(ListenSeconds).Max();
}
