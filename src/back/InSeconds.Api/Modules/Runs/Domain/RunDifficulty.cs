namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>La difficulté d'une manche, choisie par le joueur avant son premier morceau (colonne <c>difficulty</c> : la valeur est stockée).</summary>
public enum RunDifficulty : short
{
    /// <summary>« Facile » : objectif bas, points réduits.</summary>
    Easy = 1,

    /// <summary>« Sûre » : l'objectif et les points du proto 1 ; la difficulté d'une manche sans choix.</summary>
    Safe = 2,

    /// <summary>« Risquée » : objectif haut, points augmentés ; la dernière manche en Risquée est la manche boss (écoute raccourcie).</summary>
    Risky = 3,
}

/// <summary>Les noms des difficultés dans l'API et les réglages (<c>easy</c>, <c>safe</c>, <c>risky</c>), jamais un texte affiché.</summary>
public static class RunDifficulties
{
    public static string KeyOf(RunDifficulty difficulty) => difficulty switch
    {
        RunDifficulty.Easy => "easy",
        RunDifficulty.Safe => "safe",
        RunDifficulty.Risky => "risky",
        _ => throw new ArgumentOutOfRangeException(nameof(difficulty)),
    };

    public static RunDifficulty? Parse(string? key) => key switch
    {
        "easy" => RunDifficulty.Easy,
        "safe" => RunDifficulty.Safe,
        "risky" => RunDifficulty.Risky,
        _ => null,
    };
}

/// <summary>
/// Une difficulté proposée pour une manche, figée dans la playlist à sa création.
/// </summary>
/// <param name="PointsFactor">
/// Le facteur appliqué aux points de chaque morceau de la manche (en plus du multiplicateur de la manche) : le plafond de la manche est son maximum à
/// ce facteur. Rien ne se multiplie sur le total du run : les points acquis ne sont jamais retirés.
/// </param>
/// <param name="ObjectivePercent">
/// L'objectif de la manche, en pourcentage de son maximum **sans facteur** (le maximum du proto 1, morceaux neutralisés retirés) : « Sûre » reprend
/// le seuil de la manche, « Facile » et « Risquée » en sont une fraction et un multiple. Peut dépasser 100 quand le facteur de points le permet.
/// </param>
/// <param name="ListenSeconds">La durée d'écoute fixe d'un morceau de la manche (plus courte pour la manche boss).</param>
public sealed record RunDifficultyOption(RunDifficulty Difficulty, decimal PointsFactor, int ObjectivePercent, decimal ListenSeconds)
{
    /// <summary>Le multiplicateur effectif d'un morceau de la manche : celui de sa manche, à ce facteur.</summary>
    public decimal Scale(decimal multiplier) => multiplier * PointsFactor;
}

/// <summary>Les difficultés proposées pour une manche (une seule : pas de choix, comme la première manche).</summary>
public sealed record RunRoundRules(int Round, IReadOnlyList<RunDifficultyOption> Options);

/// <summary>Une difficulté telle que les réglages la décrivent, avant d'être figée pour chaque manche.</summary>
/// <param name="ObjectiveFactor">L'objectif de la manche, en multiple du seuil de la manche (celui de « Sûre »).</param>
public sealed record RunDifficultyProfile(RunDifficulty Difficulty, decimal PointsFactor, decimal ObjectiveFactor);

/// <summary>
/// Les difficultés de chaque manche d'une playlist, à partir des seuils et des difficultés des réglages : la première manche se joue en « Sûre »
/// seule (le run démarre comme au proto 1), les suivantes proposent toutes les difficultés, et la dernière en « Risquée » est la manche boss
/// (écoute raccourcie). L'objectif d'une difficulté est le seuil de la manche multiplié par son facteur, arrondi au pourcentage le plus proche.
/// </summary>
public static class RunRoundPlan
{
    public static int ObjectivePercentOf(int thresholdPercent, decimal objectiveFactor) =>
        (int)decimal.Round(thresholdPercent * objectiveFactor, 0, MidpointRounding.AwayFromZero);

    /// <summary>
    /// L'objectif reste atteignable : en pourcentage du maximum sans facteur, il ne dépasse pas le plafond de la difficulté (100 × facteur de points).
    /// </summary>
    public static bool IsReachable(int thresholdPercent, RunDifficultyProfile profile)
    {
        ArgumentNullException.ThrowIfNull(profile);
        return ObjectivePercentOf(thresholdPercent, profile.ObjectiveFactor) <= 100m * profile.PointsFactor;
    }

    /// <param name="bossListenSeconds">L'écoute de la manche boss ; 0 : pas de manche boss.</param>
    public static IReadOnlyList<RunRoundRules> Plan(
        int rounds, IReadOnlyList<int> thresholdPercents, IReadOnlyCollection<RunDifficultyProfile> profiles, decimal listenSeconds,
        decimal bossListenSeconds)
    {
        ArgumentNullException.ThrowIfNull(thresholdPercents);
        ArgumentNullException.ThrowIfNull(profiles);
        var ordered = profiles.OrderBy(p => p.Difficulty).ToList();
        return Enumerable.Range(1, rounds).Select(round =>
        {
            var offered = round == 1 ? ordered.Where(p => p.Difficulty == RunDifficulty.Safe) : ordered;
            var boss = bossListenSeconds > 0 && rounds > 1 && round == rounds;
            return new RunRoundRules(round, offered.Select(p => new RunDifficultyOption(
                p.Difficulty,
                p.PointsFactor,
                ObjectivePercentOf(thresholdPercents[round - 1], p.ObjectiveFactor),
                boss && p.Difficulty == RunDifficulty.Risky ? bossListenSeconds : listenSeconds)).ToList());
        }).ToList();
    }
}
