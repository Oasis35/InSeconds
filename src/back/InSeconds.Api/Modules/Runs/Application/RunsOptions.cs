using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Réglages de la Série, relus à chaud depuis <c>infra.settings</c> (<c>Runs:…</c>). Aucune ligne en base n'est nécessaire : les valeurs par défaut
/// sont celles de la Série. **Les listes n'ont pas de valeur initiale** (le binder ajouterait les éléments lus à ceux de la valeur initiale) : les
/// défauts sont dans les propriétés <c>Effective…</c>, seules lues par le code. Ces réglages ne touchent jamais un défi déjà créé : ses règles sont figées
/// (<see cref="RunRules"/>).
/// </summary>
public sealed class RunsOptions
{
    public const string Section = "Runs";

    public const int DefaultLives = 3;
    public const int DefaultTracksPerRound = 3;
    public const int DefaultMaxRounds = 8;
    public const int DefaultLifeBonus = 250;
    public const int DefaultCompleteBonus = 500;
    public const int DefaultAnswerSeconds = 45;
    public const int DefaultRankBands = 8;

    /// <summary>Bornes : une position de morceau tient dans un <c>smallint</c>, une durée dans <c>numeric(4,2)</c>.</summary>
    public const int MaxLives = 10;
    public const int MaxTracksPerRound = 20;
    public const int MaxRankBands = 20;
    public const int MaxMaxRounds = 50;
    public const int MaxBonus = 100_000;

    /// <summary>Le chrono le plus long accepté (10 minutes) ; 0 coupe le chrono des nouvelles playlists.</summary>
    public const int MaxAnswerSeconds = 600;

    /// <summary>L'échelle d'écoute : 10, 5, 3, 2, 1 puis 0,5 s (le dernier palier se répète). Une liste neuve à chaque lecture.</summary>
    public static decimal[] DefaultListenLadder => [10m, 5m, 3m, 2m, 1m, 0.5m];

    /// <summary>Les points d'un morceau trouvé en entier à chaque palier de l'échelle : provisoires, à régler aux parties de test.</summary>
    public static int[] DefaultStepPoints => [100, 200, 350, 550, 800, 1200];

    /// <summary>Les vies au départ : une erreur, un morceau passé ou un chrono écoulé en coûte une.</summary>
    public int Lives { get; set; } = DefaultLives;

    /// <summary>Le niveau du joueur (<c>Runs:Levels:…</c>) : fenêtre de la moyenne, parties provisoires, disques et seuils.</summary>
    public RunLevelOptions Levels { get; set; } = new();

    public int TracksPerRound { get; set; } = DefaultTracksPerRound;

    /// <summary>Les durées d'écoute, du premier palier (le plus long) au dernier (le plus court), strictement décroissantes.</summary>
    public decimal[]? ListenLadder { get; set; }

    /// <summary>Les points d'un morceau trouvé en entier à chaque palier de <see cref="ListenLadder"/> (une valeur par palier).</summary>
    public int[]? StepPoints { get; set; }

    /// <summary>Le chrono d'un morceau en secondes, du premier son à la réponse ; 0 : pas de chrono.</summary>
    public int AnswerSeconds { get; set; } = DefaultAnswerSeconds;

    /// <summary>En combien de tranches de notoriété le catalogue est coupé : la manche k tire dans la tranche k, la dernière se répète.</summary>
    public int RankBands { get; set; } = DefaultRankBands;

    /// <summary>Une manche finie sans vie perdue rend une vie (jamais au-dessus de <see cref="Lives"/>).</summary>
    public bool RegainLife { get; set; } = true;

    /// <summary>L'écoute raccourcit dès qu'une manche se termine sans vie perdue (une moitié juste ne gêne plus).</summary>
    public bool ShortenOnNoLifeLost { get; set; } = true;

    /// <summary>Le plafond de manches : la partie s'arrête en « Série complète » ; 0 : pas de plafond.</summary>
    public int MaxRounds { get; set; } = DefaultMaxRounds;

    /// <summary>Les points de chaque vie restante à la fin d'une Série complète.</summary>
    public int LifeBonus { get; set; } = DefaultLifeBonus;

    /// <summary>Les points d'une Série complète.</summary>
    public int CompleteBonus { get; set; } = DefaultCompleteBonus;

    public IReadOnlyList<decimal> EffectiveListenLadder => ListenLadder ?? DefaultListenLadder;

    public IReadOnlyList<int> EffectiveStepPoints => StepPoints ?? DefaultStepPoints;

    /// <summary>Les règles que ces réglages décrivent (à ne figer qu'une fois <see cref="RunsOptionsChecks.Problems"/> vide).</summary>
    public RunRules ToRules() =>
        new(
            Lives, TracksPerRound, [.. EffectiveListenLadder], [.. EffectiveStepPoints], AnswerSeconds, Themes: null, RankBands,
            RegainLife, MaxRounds, LifeBonus, CompleteBonus, ShortenOnNoLifeLost);

    public static RunRules DefaultRules() => new RunsOptions().ToRules();
}

/// <summary>
/// Le niveau du joueur (<c>Runs:Levels:…</c>, relu à chaud) : ses points de niveau sont la moyenne de ses <see cref="Window"/> dernières parties finies
/// (<see cref="RunLevelPolicy"/>). **Pas de valeur initiale sur la liste** : le défaut est dans <see cref="EffectiveDiscs"/>.
/// </summary>
public sealed class RunLevelOptions
{
    public const int DefaultWindow = 10;
    public const int DefaultProvisionalRuns = 3;

    /// <summary>Le nombre de parties finies (les plus récentes) dont la moyenne donne les points de niveau.</summary>
    public int Window { get; set; } = DefaultWindow;

    /// <summary>Le niveau reste « provisoire » tant que le joueur a fini moins de parties.</summary>
    public int ProvisionalRuns { get; set; } = DefaultProvisionalRuns;

    /// <summary>
    /// Les disques de niveau, du plus bas au plus haut : liste d'objets <c>{ "disc": "runs.discs.gold", "points": 1600 }</c> (clé de traduction et points
    /// de niveau à partir desquels on l'a ; le premier à 0). Sans valeur : Rayé, Cire, Bronze, Argent, Or, Platine, Double platine, Diamant.
    /// </summary>
    public RunLevelDiscSetting[]? Discs { get; set; }

    /// <summary>Une liste neuve à chaque lecture (ses éléments ont des accesseurs).</summary>
    public static RunLevelDiscSetting[] DefaultDiscs =>
    [
        new() { Disc = "runs.discs.scratched", Points = 0 },
        new() { Disc = "runs.discs.wax", Points = 300 },
        new() { Disc = "runs.discs.bronze", Points = 700 },
        new() { Disc = "runs.discs.silver", Points = 1100 },
        new() { Disc = "runs.discs.gold", Points = 1600 },
        new() { Disc = "runs.discs.platinum", Points = 2200 },
        new() { Disc = "runs.discs.double_platinum", Points = 2800 },
        new() { Disc = "runs.discs.diamond", Points = 3400 },
    ];

    public IReadOnlyList<RunLevelDiscSetting> EffectiveDiscs => Discs ?? DefaultDiscs;

    public IReadOnlyList<RunLevelStep> Ladder => [.. EffectiveDiscs.Select(d => new RunLevelStep(d.Disc, d.Points))];
}

/// <summary>Un disque de niveau dans les réglages : sa clé de traduction et les points de niveau qui le donnent.</summary>
public sealed class RunLevelDiscSetting
{
    public string Disc { get; set; } = "";

    public int Points { get; set; }
}

/// <summary>La cohérence des réglages, partagée par le contrôle du démarrage, <see cref="RunsRules"/> et les tests.</summary>
public static class RunsOptionsChecks
{
    /// <summary>Ce qui est faux dans ces réglages (vide si tout va bien).</summary>
    public static IReadOnlyList<string> Problems(RunsOptions options)
    {
        var problems = new List<string>();
        if (options.Lives is < 1 or > RunsOptions.MaxLives)
            problems.Add($"Runs:Lives : de 1 à {RunsOptions.MaxLives} vies.");
        if (options.TracksPerRound is < 1 or > RunsOptions.MaxTracksPerRound)
            problems.Add($"Runs:TracksPerRound : de 1 à {RunsOptions.MaxTracksPerRound} morceaux par manche.");
        if (options.RankBands is < 1 or > RunsOptions.MaxRankBands)
            problems.Add($"Runs:RankBands : de 1 à {RunsOptions.MaxRankBands} tranches.");
        if (options.MaxRounds is < 0 or > RunsOptions.MaxMaxRounds)
            problems.Add($"Runs:MaxRounds : de 0 (pas de plafond) à {RunsOptions.MaxMaxRounds} manches.");
        if (options.LifeBonus is < 0 or > RunsOptions.MaxBonus || options.CompleteBonus is < 0 or > RunsOptions.MaxBonus)
            problems.Add($"Runs:LifeBonus et Runs:CompleteBonus : de 0 à {RunsOptions.MaxBonus} points.");

        // Chaque durée est stockée avec le palier de la réponse (numeric(4,2)) : positive, moins de 100 s, deux décimales au plus, et l'échelle descend.
        var ladder = options.EffectiveListenLadder;
        if (ladder.Count is < 2 or > 10 || ladder.Any(l => l is <= 0 or >= 100 || decimal.Round(l, 2) != l)
            || ladder.Zip(ladder.Skip(1), (a, b) => b >= a).Any(bad => bad))
            problems.Add("Runs:ListenLadder : de 2 à 10 durées, chacune positive, sous 100 s, avec au plus deux décimales, strictement décroissantes.");

        var points = options.EffectiveStepPoints;
        if (points.Count != ladder.Count || points.Any(p => p <= 0))
            problems.Add("Runs:StepPoints : un nombre de points positif par palier de Runs:ListenLadder.");

        // Le chrono doit laisser au moins l'écoute la plus longue entière.
        if (options.AnswerSeconds != 0 && (options.AnswerSeconds > RunsOptions.MaxAnswerSeconds || ladder.Count == 0 || options.AnswerSeconds <= ladder[0]))
            problems.Add($"Runs:AnswerSeconds : 0 (pas de chrono), ou plus long que l'écoute la plus longue et au plus {RunsOptions.MaxAnswerSeconds} s.");

        problems.AddRange(LevelProblems(options.Levels));
        return problems;
    }

    private static List<string> LevelProblems(RunLevelOptions levels)
    {
        var problems = new List<string>();
        if (levels.Window is < 1 or > RunLevelPolicy.MaxStoredScores)
            problems.Add($"Runs:Levels:Window : de 1 à {RunLevelPolicy.MaxStoredScores} parties.");
        if (levels.ProvisionalRuns < 0 || levels.ProvisionalRuns > levels.Window)
            problems.Add("Runs:Levels:ProvisionalRuns : de 0 à la fenêtre.");
        var discs = levels.EffectiveDiscs;
        if (discs.Count is < 2 or > 12 || discs.Any(d => string.IsNullOrWhiteSpace(d.Disc)) || discs.Select(d => d.Disc).Distinct().Count() != discs.Count
            || discs[0].Points != 0 || discs.Zip(discs.Skip(1), (a, b) => b.Points <= a.Points).Any(bad => bad))
            problems.Add("Runs:Levels:Discs : de 2 à 12 disques distincts, le premier à 0 point, les points strictement croissants.");
        return problems;
    }
}
