using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// Réglages du module, relus à chaud depuis <c>infra.settings</c> (§ 4.6 du plan v2). Les valeurs par défaut sont celles de la v1 :
/// aucune ligne en base n'est nécessaire.
/// <para>
/// **Les listes et dictionnaires n'ont pas de valeur initiale** : le binder de configuration ajoute les éléments lus à ceux de la
/// valeur initiale au lieu de la remplacer (deux fois le palier 0,5 s). Les valeurs par défaut sont dans les propriétés
/// <c>Effective…</c>, qui seules sont lues par le code.
/// </para>
/// </summary>
public sealed class DailyOptions
{
    public const string Section = "Daily";

    /// <summary>Morceaux d'un nouveau défi. Un défi déjà généré garde les siens (la fin de partie compte les morceaux réels, piège 38).</summary>
    public int TracksPerChallenge { get; set; } = DefaultTracksPerChallenge;

    public const int DefaultTracksPerChallenge = 5;

    /// <summary>Le nombre de morceaux d'un nouveau défi : un réglage aberrant (0, négatif) retombe sur la valeur par défaut.</summary>
    public int EffectiveTracksPerChallenge => TracksPerChallenge >= 1 ? TracksPerChallenge : DefaultTracksPerChallenge;

    /// <summary>
    /// Jours pendant lesquels un morceau déjà tiré ne peut pas l'être de nouveau. Un morceau tiré le jour J est
    /// de nouveau tirable à partir de J + cooldown + 1 (règle de la v1, <c>LastUsedDate &lt; jour - cooldown</c>).
    /// </summary>
    public int TrackCooldownDays { get; set; } = DefaultTrackCooldownDays;

    public const int DefaultTrackCooldownDays = 30;

    /// <summary>Un cooldown négatif ou démesuré (une faute de saisie) retombe sur la valeur par défaut : il ne désactive pas le cooldown et ne fait pas échouer les dates.</summary>
    public int EffectiveTrackCooldownDays => TrackCooldownDays is >= 0 and <= 3650 ? TrackCooldownDays : DefaultTrackCooldownDays;

    /// <summary>Secondes laissées au joueur pour saisir sa réponse (lues par le front).</summary>
    public int GuessTimerSeconds { get; set; } = DefaultGuessTimerSeconds;

    public const int DefaultGuessTimerSeconds = 20;

    /// <summary>Les paliers d'écoute, en secondes.</summary>
    public decimal[]? AllowedDurationsSeconds { get; set; }

    public static readonly decimal[] DefaultAllowedDurationsSeconds = [0.5m, 1m, 1.5m, 2m, 3m, 5m, 10m];

    /// <summary>
    /// Un palier que la base garde tel quel (colonnes <c>numeric(4,2)</c>) : positif, de moins de 100 s, avec au plus deux décimales. Sinon le
    /// palier relu (0,33) ne serait plus celui annoncé (0,333), et la réponse suivante serait refusée sous le plancher.
    /// </summary>
    public static bool IsStorableDuration(decimal seconds) => seconds is > 0 and < 100 && decimal.Round(seconds, 2) == seconds;

    /// <summary>
    /// Les paliers, triés : jamais vide. Un réglage vide, ou dont un palier ne tient pas dans la base, retombe sur les paliers par défaut
    /// (le contrôle du démarrage le refuse, mais un réglage changé à chaud n'y passe pas).
    /// </summary>
    public IReadOnlyList<decimal> EffectiveAllowedDurationsSeconds =>
        AllowedDurationsSeconds is { Length: > 0 } configured && configured.All(IsStorableDuration)
            ? configured.Distinct().Order().ToArray()
            : DefaultAllowedDurationsSeconds;

    /// <summary>Les points de chaque palier (une liste d'objets : le binder .NET ne lit pas un dictionnaire à clé décimale).</summary>
    public List<DurationScore>? DurationScores { get; set; }

    public static readonly DurationScore[] DefaultDurationScores =
    [
        new(0.5m, 1000), new(1m, 850), new(1.5m, 700), new(2m, 550), new(3m, 400), new(5m, 250), new(10m, 100),
    ];

    public IReadOnlyList<DurationScore> EffectiveDurationScores =>
        DurationScores is { Count: > 0 } configured ? configured : DefaultDurationScores;

    /// <summary>Les durées d'écoute qui débloquent le niveau 1, 2… d'indice.</summary>
    public decimal[]? HintUnlockDurationsSeconds { get; set; }

    public static readonly decimal[] DefaultHintUnlockDurationsSeconds = [5m, 10m];

    public IReadOnlyList<decimal> EffectiveHintUnlockDurationsSeconds => HintUnlockDurationsSeconds ?? DefaultHintUnlockDurationsSeconds;

    /// <summary>Le pourcentage retiré du score par niveau d'indice révélé.</summary>
    public Dictionary<int, int>? HintPenaltyPercent { get; set; }

    public static readonly IReadOnlyDictionary<int, int> DefaultHintPenaltyPercent = new Dictionary<int, int> { [1] = 30, [2] = 60 };

    public IReadOnlyDictionary<int, int> EffectiveHintPenaltyPercent => HintPenaltyPercent ?? DefaultHintPenaltyPercent;

    /// <summary>+1 gel à chaque multiple de ce nombre de jours de série (0 : aucun gel gagné).</summary>
    public int StreakFreezeEveryDays { get; set; } = DefaultStreakFreezeEveryDays;

    public const int DefaultStreakFreezeEveryDays = 7;

    public int StreakFreezeMax { get; set; } = DefaultStreakFreezeMax;

    public const int DefaultStreakFreezeMax = 2;

    public int StreakLostNudgeMinDays { get; set; } = DefaultStreakLostNudgeMinDays;

    public const int DefaultStreakLostNudgeMinDays = 2;

    public StreakRules StreakRules => new(StreakFreezeEveryDays, StreakFreezeMax, StreakLostNudgeMinDays);
}
