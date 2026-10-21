using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Réglages du mode, relus à chaud depuis <c>infra.settings</c> (<c>Runs:…</c>). Aucune ligne en base n'est nécessaire : les valeurs par défaut
/// sont celles du proto 1. **Les listes n'ont pas de valeur initiale** (le binder ajouterait les éléments lus à ceux de la valeur initiale) : les
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

    /// <summary>Bornes : une position de morceau tient dans un <c>smallint</c>, un multiplicateur dans <c>numeric(3,2)</c>, une durée dans <c>numeric(4,2)</c>.</summary>
    public const int MaxRounds = 20;
    public const int MaxTracksPerRound = 20;

    public static readonly int[] DefaultThresholdPercents = [40, 50, 60, 70];

    public static readonly string[] DefaultDiscs =
        ["runs.discs.scratched", "runs.discs.wax", "runs.discs.bronze", "runs.discs.silver", "runs.discs.gold"];

    public int Rounds { get; set; } = DefaultRounds;

    public int TracksPerRound { get; set; } = DefaultTracksPerRound;

    public decimal ListenSeconds { get; set; } = DefaultListenSeconds;

    /// <summary>Par manche, la part du maximum de la manche à atteindre (de 1 à 100).</summary>
    public int[]? ThresholdPercents { get; set; }

    public decimal MinMultiplier { get; set; } = DefaultMinMultiplier;

    public decimal MaxMultiplier { get; set; } = DefaultMaxMultiplier;

    /// <summary>Les disques, du moins bon au meilleur : des clés de traduction, jamais un texte.</summary>
    public string[]? Discs { get; set; }

    public IReadOnlyList<int> EffectiveThresholdPercents => ThresholdPercents ?? DefaultThresholdPercents;

    public IReadOnlyList<string> EffectiveDiscs => Discs ?? DefaultDiscs;

    /// <summary>Les règles que ces réglages décrivent (à ne figer qu'une fois <see cref="RunsOptionsChecks.Problems"/> vide).</summary>
    public RunRules ToRules() => new(Rounds, TracksPerRound, ListenSeconds, EffectiveThresholdPercents.ToArray(), MinMultiplier, MaxMultiplier);

    public static RunRules DefaultRules() => new(
        DefaultRounds, DefaultTracksPerRound, DefaultListenSeconds, DefaultThresholdPercents, DefaultMinMultiplier, DefaultMaxMultiplier);
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

        var discs = options.EffectiveDiscs;
        if (discs.Count == 0 || discs.Any(string.IsNullOrWhiteSpace))
            problems.Add("Runs:Discs : au moins une clé de traduction, aucune vide.");
        return problems;
    }

    private static bool IsStorableMultiplier(decimal value) => value is > 0 and < 10 && decimal.Round(value, 2) == value;
}
