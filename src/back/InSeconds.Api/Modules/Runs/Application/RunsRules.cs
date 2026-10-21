using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Les règles d'un nouveau run, lues **à chaque appel** dans les réglages (relus à chaud). Des réglages incohérents (changés à chaud : le démarrage
/// les refuse, <see cref="RunsOptionsStartupCheck"/>) retombent sur les valeurs par défaut, avec une erreur au journal écrite une fois par valeur.
/// Comme <c>DailyRules</c> : une règle aberrante ne fait pas tomber le lancement d'un run.
/// </summary>
public sealed class RunsRules(IOptionsMonitor<RunsOptions> options, ILogger<RunsRules> logger)
{
    // Le dernier réglage incohérent signalé : le même texte n'est journalisé qu'une fois, et de nouveau s'il change ou revient après correction.
    private string? _reported;

    public RunsOptions Options => options.CurrentValue;

    /// <summary>Les règles à figer dans le prochain défi.</summary>
    public RunRules Current()
    {
        var current = Options;
        var problems = RunsOptionsChecks.Problems(current);
        var report = problems.Count == 0 ? null : string.Join(' ', problems);
        if (Interlocked.Exchange(ref _reported, report) != report && report is not null)
            RunsLog.InvalidOptions(logger, report);
        return problems.Count == 0 ? current.ToRules() : RunsOptions.DefaultRules();
    }

    /// <summary>Les clés de traduction des disques, ou celles par défaut si les réglages sont incohérents.</summary>
    public IReadOnlyList<string> Discs => RunsOptionsChecks.Problems(Options).Count == 0 ? Options.EffectiveDiscs : RunsOptions.DefaultDiscs;
}

/// <summary>Refuse de démarrer avec des réglages <c>Runs:</c> incohérents (lancé après le rechargement des réglages). Au démarrage seulement.</summary>
public sealed class RunsOptionsStartupCheck(IOptionsMonitor<RunsOptions> options) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var problems = RunsOptionsChecks.Problems(options.CurrentValue);
        return problems.Count == 0
            ? Task.CompletedTask
            : throw new OptionsValidationException(RunsOptions.Section, typeof(RunsOptions), problems);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
