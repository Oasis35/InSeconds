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
/// <param name="ReservePerRound">Les morceaux de réserve tirés pour chaque manche (« Échange » change de morceau) ; 0 au proto 1 : pas d'Échange.</param>
/// <param name="Cards">Les coups de pouce de la playlist : la carte que gagne chaque manche, ses effets ; vide : aucune carte.</param>
/// <param name="Themes">
/// Les manches à thème (jamais la première) : pour chacune, le thème de la liste de l'admin (« Années 80 ») dont tous ses morceaux sont tirés, et son
/// nom au moment de la création (un renommage ensuite ne change rien). Les autres manches suivent leur tranche de rang. Figé avec la playlist : tous
/// ses joueurs jouent les mêmes morceaux, la comparaison reste juste ; vide : aucune manche à thème (ou pas encore choisie, cf. <paramref name="PendingThemeRound"/>).
/// </param>
/// <param name="PendingThemeRound">
/// La manche à thème que le créateur n'a pas encore choisie : tirée avec la playlist (parmi les manches de <c>Runs:ThemedRounds</c>, ou aucune), elle
/// se joue d'abord avec les morceaux de sa tranche de rang ; le créateur choisit son thème juste avant de la commencer, et ses morceaux sont alors
/// tirés dans ce thème (<c>RunChallenge.ApplyTheme</c>). Vide : aucune manche en attente de thème.
/// </param>
public sealed record RunRules(
    int Rounds, int TracksPerRound, decimal ListenSeconds, IReadOnlyList<int> ThresholdPercents, decimal MinMultiplier, decimal MaxMultiplier,
    int AnswerSeconds = 0, IReadOnlyList<RunRoundRules>? RoundRules = null, int ReservePerRound = 0, RunCardRules? Cards = null, IReadOnlyList<RunRoundTheme>? Themes = null,
    int? PendingThemeRound = null)
{
    /// <summary>Le thème de cette manche, vide si elle n'en a pas.</summary>
    public RunRoundTheme? ThemeOf(int round) => Themes?.FirstOrDefault(t => t.Round == round);

    /// <summary>Les Échanges d'une manche : un seul, qui ne se garde pas pour la suivante.</summary>
    public const int SwapsPerRound = 1;

    /// <summary>La playlist a une réserve : le joueur peut changer de morceau (« Échange »).</summary>
    public bool HasSwap => ReservePerRound > 0;

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
}

/// <summary>Le thème d'une manche à thème : la manche, le thème de la liste de l'admin et son nom quand la playlist a été créée.</summary>
public sealed record RunRoundTheme(int Round, int ThemeId, string Name);
