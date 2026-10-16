using System.Text.Json;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Un niveau d'indice tel que le mode le propose : son seuil de déblocage, ce qu'il révèle et ce qu'il coûte.</summary>
public sealed record HintLevelInfo(int Level, decimal UnlockSeconds, HintKind Kind, int PenaltyPercent)
{
    /// <summary>
    /// Le type en texte camelCase (<c>year</c>, <c>artistMasked</c>) : un nombre n'aurait aucun sens pour le front, qui en tire l'étiquette
    /// (« Indice année », « Indice artiste ») d'un nom qui contient <c>year</c> ou <c>artist</c>.
    /// </summary>
    public string KindName => KindNameOf(Kind);

    public static string KindNameOf(HintKind kind) => JsonNamingPolicy.CamelCase.ConvertName(kind.ToString());
}

/// <summary>
/// Les règles du défi du jour, lues **à chaque appel** dans les réglages (relus à chaud) : paliers, barème, indices, gels. La politique
/// d'indices ne propose jamais plus de niveaux que les <see cref="IHintProvider"/> n'en révèlent sans trou depuis le niveau 1 (sinon un
/// niveau serait accepté, et pénalisé, sans rien révéler de plus) : le démarrage échoue si les réglages en demandent davantage
/// (<see cref="DailyOptionsStartupCheck"/>), et un réglage changé à chaud vers trop de niveaux est borné ici, avec une erreur au journal.
/// </summary>
public sealed class DailyRules(IOptionsMonitor<DailyOptions> options, IEnumerable<IHintProvider> hintProviders, ILogger<DailyRules> logger)
{
    private readonly IReadOnlyList<IHintProvider> _providers = hintProviders.OrderBy(p => p.Level).ToList();

    // Le dernier réglage incohérent signalé, par problème : une même valeur n'est journalisée qu'une fois (les règles sont lues plusieurs
    // fois par requête), et de nouveau si elle change ou revient après avoir été corrigée.
    private string? _reportedInvalidThresholds;
    private string? _reportedLevelsBeyondProviders;

    public DailyOptions Options => options.CurrentValue;

    public IReadOnlyList<IHintProvider> HintProviders => _providers;

    public IReadOnlyList<decimal> AllowedDurations => Options.EffectiveAllowedDurationsSeconds;

    /// <summary>Un palier d'écoute que le joueur peut annoncer (0, le morceau sans extrait, se vérifie à part).</summary>
    public bool IsAllowedDuration(decimal seconds) => AllowedDurations.Contains(seconds);

    public StreakRules Streak => Options.StreakRules;

    public IDailyScoringPolicy Scoring =>
        new DurationScoringPolicy(Options.EffectiveDurationScores, Options.EffectiveHintPenaltyPercent);

    /// <summary>
    /// Le nombre de niveaux d'indice révélés **sans trou depuis le niveau 1** : un niveau sans fournisseur arrête la politique (un
    /// fournisseur de niveau 3 sans niveau 2 n'est jamais proposé).
    /// </summary>
    public int MaxHintLevel { get; } = ContiguousLevels(hintProviders);

    public HintPolicy Hints => new(HintLevels.Select(l => l.UnlockSeconds));

    public IReadOnlyList<HintLevelInfo> HintLevels
    {
        get
        {
            var thresholds = ValidThresholds(Options.EffectiveHintUnlockDurationsSeconds);
            var beyond = thresholds.Count > MaxHintLevel;
            if (ReportOnce(ref _reportedLevelsBeyondProviders, beyond ? $"{thresholds.Count}/{MaxHintLevel}" : null))
                DailyLog.HintLevelsBeyondProviders(logger, thresholds.Count, MaxHintLevel);
            if (beyond)
                thresholds = thresholds.Take(MaxHintLevel).ToList();

            var penalties = Options.EffectiveHintPenaltyPercent;
            return thresholds.Select((seconds, i) =>
            {
                var level = i + 1;
                return new HintLevelInfo(level, seconds, KindOf(level), penalties.GetValueOrDefault(level));
            }).ToList();
        }
    }

    private HintKind KindOf(int level) => _providers.First(p => p.Level == level).Kind;

    private static int ContiguousLevels(IEnumerable<IHintProvider> providers)
    {
        var levels = providers.Select(p => p.Level).ToHashSet();
        var count = 0;
        while (levels.Contains(count + 1))
            count++;
        return count;
    }

    // Des seuils incohérents (non croissants) ne doivent pas faire échouer chaque demande d'indice : ceux de la v1 les remplacent.
    private IReadOnlyList<decimal> ValidThresholds(IReadOnlyList<decimal> configured)
    {
        var valid = DailyOptionsChecks.HintThresholdsAreValid(configured);
        if (ReportOnce(ref _reportedInvalidThresholds, valid ? null : string.Join(';', configured)))
            DailyLog.InvalidHintThresholds(logger);
        return valid ? configured : DailyOptions.DefaultHintUnlockDurationsSeconds;
    }

    /// <summary>
    /// Vrai si ce problème (vide : aucun) est nouveau et doit être journalisé. Un problème réglé efface la mémoire : s'il revient, il est
    /// de nouveau signalé.
    /// </summary>
    private static bool ReportOnce(ref string? reported, string? problem) =>
        Interlocked.Exchange(ref reported, problem) != problem && problem is not null;
}

/// <summary>Les règles de cohérence des réglages, partagées par le contrôle du démarrage et les tests.</summary>
public static class DailyOptionsChecks
{
    /// <summary>Strictement positifs et croissants : un niveau plus haut se débloque plus tard.</summary>
    public static bool HintThresholdsAreValid(IReadOnlyList<decimal> thresholds) =>
        thresholds.Select((seconds, i) => seconds > 0 && (i == 0 || seconds > thresholds[i - 1])).All(ok => ok);

    /// <summary>Ce qui est faux dans ces réglages (vide si tout va bien).</summary>
    public static IReadOnlyList<string> Problems(DailyOptions options, int maxHintLevel)
    {
        var problems = new List<string>();
        var thresholds = options.EffectiveHintUnlockDurationsSeconds;
        if (!HintThresholdsAreValid(thresholds))
            problems.Add("Daily:HintUnlockDurationsSeconds doit être strictement positif et croissant.");
        if (thresholds.Count > maxHintLevel)
        {
            problems.Add(
                $"Daily:HintUnlockDurationsSeconds propose {thresholds.Count} niveaux d'indice, mais les fournisseurs d'indices n'en révèlent que {maxHintLevel} : " +
                "un niveau serait accepté et pénalisé sans rien révéler de plus.");
        }

        // La colonne est numeric(4,2) : au plus deux décimales, moins de 100 s, sinon le palier relu ne serait plus celui annoncé.
        if (options.AllowedDurationsSeconds is { } durations && !durations.All(DailyOptions.IsStorableDuration))
            problems.Add("Daily:AllowedDurationsSeconds : des paliers positifs, de moins de 100 s, avec au plus deux décimales.");
        if (options.DurationScores is { } scores && scores.Any(s => s.Seconds <= 0 || s.Score < 0))
            problems.Add("Daily:DurationScores : chaque palier doit être positif, avec des points qui ne le sont pas moins.");
        if (options.HintPenaltyPercent is { } penalties && penalties.Any(p => p.Key < 1 || p.Value is < 0 or > 100))
            problems.Add("Daily:HintPenaltyPercent : un niveau à partir de 1, un pourcentage de 0 à 100.");
        if (options.StreakFreezeEveryDays < 0 || options.StreakFreezeMax < 0 || options.StreakLostNudgeMinDays < 0)
            problems.Add("Daily:StreakFreeze* et StreakLostNudgeMinDays ne peuvent pas être négatifs.");
        return problems;
    }
}

/// <summary>
/// Refuse de démarrer avec des réglages incohérents (revue de D1) : mieux vaut une API qui ne démarre pas qu'un indice payé sans rien
/// révéler. Le contrôle ne s'applique qu'au démarrage : un réglage changé ensuite, à chaud, ne fait pas tomber les parties en cours
/// (<see cref="DailyRules"/> le borne). Lancé après le rechargement des réglages (<c>StartAsync</c> suit tous les <c>StartingAsync</c>).
/// </summary>
public sealed class DailyOptionsStartupCheck(DailyRules rules) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var problems = DailyOptionsChecks.Problems(rules.Options, rules.MaxHintLevel);
        return problems.Count == 0
            ? Task.CompletedTask
            : throw new OptionsValidationException(DailyOptions.Section, typeof(DailyOptions), problems);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
