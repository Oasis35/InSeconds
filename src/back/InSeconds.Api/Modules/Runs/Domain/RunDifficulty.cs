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
public sealed record RunRoundRules(int Round, IReadOnlyList<RunDifficultyOption> Options)
{
    public bool HasChoice => Options.Count > 1;
}
