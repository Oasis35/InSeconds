using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// Les règles du défi du jour, lues **à chaque appel** dans les réglages (relus à chaud) : paliers, barème, gels.
/// </summary>
public sealed class DailyRules(IOptionsMonitor<DailyOptions> options, ILogger<DailyRules> logger)
{
    // Le dernier réglage incohérent signalé, par problème : une même valeur n'est journalisée qu'une fois (les règles sont lues plusieurs
    // fois par requête), et de nouveau si elle change ou revient après avoir été corrigée.
    private string? _reportedInvalidRetryPercent;

    public DailyOptions Options => options.CurrentValue;

    public IReadOnlyList<decimal> AllowedDurations => Options.EffectiveAllowedDurationsSeconds;

    /// <summary>Un palier d'écoute que le joueur peut annoncer (0, le morceau sans extrait, se vérifie à part).</summary>
    public bool IsAllowedDuration(decimal seconds) => AllowedDurations.Contains(seconds);

    public StreakRules Streak => Options.StreakRules;

    public IDailyScoringPolicy Scoring =>
        new DurationScoringPolicy(Options.EffectiveDurationScores, RetryScorePercent);

    /// <summary>
    /// Le score de la seconde tentative en pourcentage de la première (0 : pas de seconde tentative). Un réglage hors de 0 à 100, changé à chaud,
    /// retombe sur le défaut avec une erreur au journal (le contrôle du démarrage le refuse).
    /// </summary>
    public int RetryScorePercent
    {
        get
        {
            var configured = Options.RetryScorePercent;
            var valid = DailyOptions.IsValidRetryScorePercent(configured);
            if (ReportOnce(ref _reportedInvalidRetryPercent, valid ? null : configured.ToString(System.Globalization.CultureInfo.InvariantCulture)))
                DailyLog.InvalidRetryScorePercent(logger, configured);
            return valid ? configured : DailyOptions.DefaultRetryScorePercent;
        }
    }

    /// <summary>Le joueur a-t-il droit à une seconde tentative après une réponse non complète ?</summary>
    public bool RetryEnabled => RetryScorePercent > 0;

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
    /// <summary>Ce qui est faux dans ces réglages (vide si tout va bien).</summary>
    public static IReadOnlyList<string> Problems(DailyOptions options)
    {
        var problems = new List<string>();
        // La colonne est numeric(4,2) : au plus deux décimales, moins de 100 s, sinon le palier relu ne serait plus celui annoncé.
        if (options.AllowedDurationsSeconds is { } durations && !durations.All(DailyOptions.IsStorableDuration))
            problems.Add("Daily:AllowedDurationsSeconds : des paliers positifs, de moins de 100 s, avec au plus deux décimales.");
        if (options.DurationScores is { } scores && scores.Any(s => s.Seconds <= 0 || s.Score < 0))
            problems.Add("Daily:DurationScores : chaque palier doit être positif, avec des points qui ne le sont pas moins.");
        if (!DailyOptions.IsValidTrackCooldownPoolPercent(options.TrackCooldownPoolPercent))
        {
            problems.Add(
                $"Daily:TrackCooldownPoolPercent : de {DailyOptions.MinTrackCooldownPoolPercent} à {DailyOptions.MaxTrackCooldownPoolPercent} % du pool en cooldown.");
        }

        if (!DailyOptions.IsValidRetryScorePercent(options.RetryScorePercent))
            problems.Add("Daily:RetryScorePercent : un pourcentage de 0 (pas de seconde tentative) à 100.");

        if (options.StreakFreezeEveryDays < 0 || options.StreakFreezeMax < 0 || options.StreakLostNudgeMinDays < 0)
            problems.Add("Daily:StreakFreeze* et StreakLostNudgeMinDays ne peuvent pas être négatifs.");
        return problems;
    }
}

/// <summary>
/// Refuse de démarrer avec des réglages incohérents : mieux vaut une API qui ne démarre pas qu'un barème faux. Le contrôle ne s'applique qu'au démarrage : un réglage changé ensuite, à chaud, ne fait pas tomber les parties en cours. Lancé après le rechargement des réglages (<c>StartAsync</c> suit tous les <c>StartingAsync</c>).
/// </summary>
public sealed class DailyOptionsStartupCheck(DailyRules rules) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var problems = DailyOptionsChecks.Problems(rules.Options);
        return problems.Count == 0
            ? Task.CompletedTask
            : throw new OptionsValidationException(DailyOptions.Section, typeof(DailyOptions), problems);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
