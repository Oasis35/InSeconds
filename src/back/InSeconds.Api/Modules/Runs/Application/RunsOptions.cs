using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Réglages du mode, relus à chaud depuis <c>infra.settings</c> (<c>Runs:…</c>). Aucune ligne en base n'est nécessaire : les valeurs par défaut
/// sont celles du proto 2 (difficultés par manche, réserve pour le Joker). **Les listes n'ont pas de valeur initiale** (le binder ajouterait les éléments lus à ceux de la valeur initiale) : les
/// défauts sont dans les propriétés <c>Effective…</c>, seules lues par le code. Ces réglages ne touchent jamais un défi déjà créé : ses règles sont figées
/// (<see cref="RunRules"/>).
/// </summary>
public sealed class RunsOptions
{
    public const string Section = "Runs";

    public const int DefaultRounds = 4;
    public const int DefaultTracksPerRound = 5;
    public const decimal DefaultListenSeconds = 10m;
    public const decimal DefaultMinMultiplier = 1m;
    public const decimal DefaultMaxMultiplier = 2m;
    public const int DefaultAnswerSeconds = 45;
    public const decimal DefaultBossListenSeconds = 5m;
    public const int DefaultReservePerRound = 2;

    /// <summary>La plus grande réserve de morceaux par manche (une main n'a que deux cartes).</summary>
    public const int MaxReservePerRound = 5;

    /// <summary>Le chrono le plus long accepté (10 minutes) ; 0 coupe le chrono des nouvelles playlists.</summary>
    public const int MaxAnswerSeconds = 600;

    /// <summary>Bornes : une position de morceau tient dans un <c>smallint</c>, un multiplicateur dans <c>numeric(3,2)</c>, une durée dans <c>numeric(4,2)</c>.</summary>
    public const int MaxRounds = 20;
    public const int MaxTracksPerRound = 20;

    public static readonly int[] DefaultThresholdPercents = [45, 55, 65, 75];

    /// <summary>
    /// Les trois difficultés du proto 2 (provisoires, docs/runs/proto2.md) : « Sûre » reprend le seuil et les points du proto 1 ; « Facile » vise
    /// 60 % de ce seuil pour deux tiers des points, « Risquée » 150 % pour un tiers de points en plus.
    /// </summary>
    /// <remarks>Une liste neuve à chaque lecture : ses éléments ont des accesseurs, une modification ne touche jamais les défauts.</remarks>
    public static RunDifficultySetting[] DefaultDifficulties =>
    [
        new() { Difficulty = "easy", PointsFactor = 0.67m, ObjectiveFactor = 0.6m },
        new() { Difficulty = "safe", PointsFactor = 1m, ObjectiveFactor = 1m },
        new() { Difficulty = "risky", PointsFactor = 1.33m, ObjectiveFactor = 1.5m },
    ];

    public const int DefaultHandSize = 2;
    public const decimal DefaultExtendListenSeconds = 20m;
    public const int DefaultHourglassSeconds = 30;
    public const int DefaultLowerTargetPercent = 20;

    /// <summary>L'écoute la plus longue d'une « Rallonge » : un extrait Deezer dure 30 s.</summary>
    public const decimal MaxExtendListenSeconds = 30m;

    /// <summary>Les coups de pouce du proto 2 (tous, provisoire) : leurs noms d'API.</summary>
    public static string[] DefaultCards => [.. RunCards.All.Select(RunCards.KeyOf)];

    public static readonly string[] DefaultDiscs =
        ["runs.discs.scratched", "runs.discs.wax", "runs.discs.bronze", "runs.discs.silver", "runs.discs.gold"];

    public int Rounds { get; set; } = DefaultRounds;

    public int TracksPerRound { get; set; } = DefaultTracksPerRound;

    public decimal ListenSeconds { get; set; } = DefaultListenSeconds;

    /// <summary>Par manche, la part du maximum de la manche à atteindre (de 1 à 100).</summary>
    public int[]? ThresholdPercents { get; set; }

    public decimal MinMultiplier { get; set; } = DefaultMinMultiplier;

    public decimal MaxMultiplier { get; set; } = DefaultMaxMultiplier;

    /// <summary>Le chrono d'un morceau en secondes, du premier son à la réponse ; 0 : pas de chrono.</summary>
    public int AnswerSeconds { get; set; } = DefaultAnswerSeconds;

    /// <summary>Les disques, du moins bon au meilleur : des clés de traduction, jamais un texte.</summary>
    public string[]? Discs { get; set; }

    /// <summary>
    /// Les difficultés proposées à partir de la deuxième manche (la première se joue en « Sûre ») : liste d'objets
    /// <c>{ "difficulty": "easy", "pointsFactor": 0.67, "objectiveFactor": 0.6 }</c>. Une seule (« safe ») : plus de choix.
    /// </summary>
    public RunDifficultySetting[]? Difficulties { get; set; }

    /// <summary>L'écoute de la manche boss (la dernière, en « Risquée ») ; 0 : pas de manche boss.</summary>
    public decimal BossListenSeconds { get; set; } = DefaultBossListenSeconds;

    /// <summary>Les morceaux de réserve tirés pour chaque manche (Joker).</summary>
    public int ReservePerRound { get; set; } = DefaultReservePerRound;

    /// <summary>Les coups de pouce : faux, aucune carte dans les nouvelles playlists (une liste vide ne s'écrit pas dans les réglages).</summary>
    public bool CardsEnabled { get; set; } = true;

    /// <summary>Les coups de pouce que les playlists peuvent offrir (noms d'API : <c>three_choices</c>, <c>joker</c>…) ; sans valeur, tous.</summary>
    public string[]? Cards { get; set; }

    /// <summary>Les emplacements de la main.</summary>
    public int HandSize { get; set; } = DefaultHandSize;

    /// <summary>L'écoute d'un morceau sous « Rallonge ».</summary>
    public decimal ExtendListenSeconds { get; set; } = DefaultExtendListenSeconds;

    /// <summary>Les secondes que « Sablier » ajoute au chrono (décidé : +30 s plutôt que le chrono suspendu, docs/runs/proto2.md).</summary>
    public int HourglassSeconds { get; set; } = DefaultHourglassSeconds;

    /// <summary>La baisse de l'objectif de la manche sous « Seuil abaissé », en pourcentage.</summary>
    public int LowerTargetPercent { get; set; } = DefaultLowerTargetPercent;

    public IReadOnlyList<string> EffectiveCards => Cards ?? DefaultCards;

    public IReadOnlyList<int> EffectiveThresholdPercents => ThresholdPercents ?? DefaultThresholdPercents;

    public IReadOnlyList<string> EffectiveDiscs => Discs ?? DefaultDiscs;

    public IReadOnlyList<RunDifficultySetting> EffectiveDifficulties => Difficulties ?? DefaultDifficulties;

    /// <summary>Les règles que ces réglages décrivent (à ne figer qu'une fois <see cref="RunsOptionsChecks.Problems"/> vide).</summary>
    public RunRules ToRules()
    {
        var thresholds = EffectiveThresholdPercents.ToArray();
        var roundRules = RunRoundPlan.Plan(Rounds, thresholds, EffectiveProfiles(), ListenSeconds, BossListenSeconds);
        var pool = EffectiveCards.Select(key => RunCards.Parse(key)!.Value).Distinct().Order().ToList();
        // Les offres et la carte de départ se tirent avec la playlist (RunCardDealer, graine de la playlist).
        var cards = !CardsEnabled || pool.Count == 0
            ? null
            : new RunCardRules(HandSize, null, [], ExtendListenSeconds, HourglassSeconds, LowerTargetPercent, pool);
        return new RunRules(
            Rounds, TracksPerRound, ListenSeconds, thresholds, MinMultiplier, MaxMultiplier, AnswerSeconds, roundRules, ReservePerRound, cards);
    }

    /// <summary>Les difficultés des réglages, lues (à n'appeler qu'une fois les noms vérifiés).</summary>
    internal List<RunDifficultyProfile> EffectiveProfiles() =>
        EffectiveDifficulties.Select(d => new RunDifficultyProfile(RunDifficulties.Parse(d.Difficulty)!.Value, d.PointsFactor, d.ObjectiveFactor)).ToList();

    public static RunRules DefaultRules() => new RunsOptions().ToRules();
}

/// <summary>Une difficulté dans les réglages : son nom (<c>easy</c>, <c>safe</c>, <c>risky</c>), son facteur de points et celui de l'objectif « Sûre ».</summary>
public sealed class RunDifficultySetting
{
    public string Difficulty { get; set; } = "";

    /// <summary>Le facteur des points de chaque morceau de la manche (le plafond de la colonne).</summary>
    public decimal PointsFactor { get; set; } = 1m;

    /// <summary>L'objectif de la manche, en multiple du seuil de la manche (<c>Runs:ThresholdPercents</c>).</summary>
    public decimal ObjectiveFactor { get; set; } = 1m;
}

/// <summary>La cohérence des réglages, partagée par le contrôle du démarrage, <see cref="RunsRules"/> et les tests.</summary>
public static class RunsOptionsChecks
{
    /// <summary>Ce qui est faux dans ces réglages (vide si tout va bien).</summary>
    public static IReadOnlyList<string> Problems(RunsOptions options)
    {
        var problems = new List<string>();
        if (options.Rounds is < 1 or > RunsOptions.MaxRounds)
            problems.Add($"Runs:Rounds : de 1 à {RunsOptions.MaxRounds} manches.");
        if (options.TracksPerRound is < 1 or > RunsOptions.MaxTracksPerRound)
            problems.Add($"Runs:TracksPerRound : de 1 à {RunsOptions.MaxTracksPerRound} morceaux par manche.");
        // La durée est stockée avec le palier de la réponse (numeric(4,2)) : positive, moins de 100 s, deux décimales au plus.
        if (options.ListenSeconds is <= 0 or >= 100 || decimal.Round(options.ListenSeconds, 2) != options.ListenSeconds)
            problems.Add("Runs:ListenSeconds : positif, moins de 100 s, avec au plus deux décimales.");

        var thresholds = options.EffectiveThresholdPercents;
        if (thresholds.Count != options.Rounds || thresholds.Any(p => p is < 1 or > 100))
            problems.Add("Runs:ThresholdPercents : un pourcentage de 1 à 100 par manche.");

        // Le multiplicateur est stocké en numeric(3,2) : moins de 10, deux décimales au plus.
        if (!IsStorableMultiplier(options.MinMultiplier) || !IsStorableMultiplier(options.MaxMultiplier) || options.MinMultiplier > options.MaxMultiplier)
            problems.Add("Runs:MinMultiplier et Runs:MaxMultiplier : positifs, moins de 10, au plus deux décimales, le minimum sans dépasser le maximum.");

        // Le chrono doit laisser au moins l'écoute entière.
        if (options.AnswerSeconds != 0 && (options.AnswerSeconds > RunsOptions.MaxAnswerSeconds || options.AnswerSeconds <= options.ListenSeconds))
            problems.Add($"Runs:AnswerSeconds : 0 (pas de chrono), ou plus long que l'écoute et au plus {RunsOptions.MaxAnswerSeconds} s.");

        var difficulties = options.EffectiveDifficulties;
        var keys = difficulties.Select(d => RunDifficulties.Parse(d.Difficulty)).ToList();
        if (difficulties.Count is < 1 or > 3 || keys.Contains(null) || keys.Distinct().Count() != keys.Count || !keys.Contains(RunDifficulty.Safe))
            problems.Add("Runs:Difficulties : de une à trois difficultés distinctes parmi easy, safe et risky, safe comprise.");
        if (difficulties.Any(d => d.PointsFactor is <= 0 or > 5 || d.ObjectiveFactor is <= 0 or > 3))
            problems.Add("Runs:Difficulties : un facteur de points de plus de 0 à 5, un facteur d'objectif de plus de 0 à 3.");
        else if (thresholds.Count == options.Rounds && !keys.Contains(null))
        {
            var profiles = options.EffectiveProfiles();
            if (thresholds.Any(t => profiles.Exists(p => RunRoundPlan.ObjectivePercentOf(t, p.ObjectiveFactor) < 1)))
                problems.Add("Runs:Difficulties : chaque objectif doit valoir au moins 1 % du maximum de la manche.");
            // Un objectif au-dessus du plafond rendrait la manche impossible à passer, même sans faute.
            if (thresholds.Any(t => profiles.Exists(p => !RunRoundPlan.IsReachable(t, p))))
                problems.Add("Runs:Difficulties : chaque objectif doit rester sous le plafond de sa difficulté (seuil × facteur d'objectif ≤ 100 × facteur de points).");
        }

        if (options.BossListenSeconds != 0
            && (options.BossListenSeconds < 0 || options.BossListenSeconds > options.ListenSeconds
                || decimal.Round(options.BossListenSeconds, 2) != options.BossListenSeconds))
            problems.Add("Runs:BossListenSeconds : 0 (pas de manche boss), ou positif, au plus l'écoute normale, avec au plus deux décimales.");

        if (options.ReservePerRound is < 0 or > RunsOptions.MaxReservePerRound)
            problems.Add($"Runs:ReservePerRound : de 0 à {RunsOptions.MaxReservePerRound} morceaux de réserve par manche.");

        var cardKeys = options.EffectiveCards.Select(RunCards.Parse).ToList();
        if (cardKeys.Contains(null) || cardKeys.Distinct().Count() != cardKeys.Count)
            problems.Add("Runs:Cards : des noms de cartes connus (three_choices, joker, year, initials, extend, net, lower_target, hourglass), sans doublon.");
        if (options.HandSize is < 1 or > 5)
            problems.Add("Runs:HandSize : de 1 à 5 emplacements.");
        if (options.ExtendListenSeconds < options.ListenSeconds || options.ExtendListenSeconds > RunsOptions.MaxExtendListenSeconds
            || decimal.Round(options.ExtendListenSeconds, 2) != options.ExtendListenSeconds
            || (options.AnswerSeconds != 0 && options.AnswerSeconds <= options.ExtendListenSeconds))
            problems.Add($"Runs:ExtendListenSeconds : de l'écoute normale à {RunsOptions.MaxExtendListenSeconds} s, deux décimales au plus, sous le chrono.");
        if (options.HourglassSeconds is < 1 or > RunsOptions.MaxAnswerSeconds)
            problems.Add($"Runs:HourglassSeconds : de 1 à {RunsOptions.MaxAnswerSeconds} s.");
        if (options.LowerTargetPercent is < 1 or > 90)
            problems.Add("Runs:LowerTargetPercent : de 1 à 90 %.");

        var discs = options.EffectiveDiscs;
        if (discs.Count == 0 || discs.Any(string.IsNullOrWhiteSpace))
            problems.Add("Runs:Discs : au moins une clé de traduction, aucune vide.");
        return problems;
    }

    private static bool IsStorableMultiplier(decimal value) => value is > 0 and < 10 && decimal.Round(value, 2) == value;
}
