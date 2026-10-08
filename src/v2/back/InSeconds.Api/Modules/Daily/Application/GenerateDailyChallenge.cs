using Hangfire;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.Extensions.Options;
using Wolverine;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Codes d'erreur du défi du jour (§ 5.6 du plan v2). Ne jamais renommer un code publié.</summary>
public static class DailyErrorCodes
{
    /// <summary>Pas assez de morceaux jouables hors cooldown : renvoyé par la tâche, lu par <c>GET /api/admin/jobs/{id}</c>.</summary>
    public const string PoolInsufficient = "admin.pool_insufficient";

    /// <summary>Pas de défi aujourd'hui et le pool ne permet pas d'en générer un.</summary>
    public const string NoChallenge = "daily.no_challenge";

    public const string AlreadyPlayed = "daily.already_played";

    /// <summary>Le joueur a abandonné (bouton) ou laissé expirer la partie du jour : il ne la rejoue pas.</summary>
    public const string Abandoned = "daily.abandoned";

    public const string SessionNotFound = "daily.session_not_found";

    public const string TrackNotFound = "daily.track_not_found";

    /// <summary>Piège 35 : le morceau en cours n'a pas reçu sa réponse, le verrou ne se déplace pas.</summary>
    public const string TrackLockNotReleased = "daily.track_lock_not_released";

    /// <summary>L'indice n'est pas encore débloqué : la durée écoutée n'a pas atteint son seuil.</summary>
    public const string HintLocked = "daily.hint_locked";

    public const string AlreadyAnswered = "daily.already_answered";

    /// <summary>La photo figée n'a de sens que pour un jour terminé pour de bon (J-2 et avant) : la veille peut encore recevoir une fin de partie (piège 18).</summary>
    public const string DayNotOver = "daily.day_not_over";

    /// <summary>Une date qui n'est pas au format aaaa-mm-jj.</summary>
    public const string InvalidDate = "admin.invalid_date";

    /// <summary>Une période dont le début dépasse la fin, ou de plus d'un an.</summary>
    public const string InvalidPeriod = "admin.invalid_period";

    /// <summary>Le palier annoncé est inférieur à la durée que le serveur a vu écouter sur ce morceau (anti-triche).</summary>
    public const string ListenedBelowMinimum = "daily.listened_duration_below_verified_minimum";
}

/// <summary>
/// Génère le défi d'un jour. Une seule logique pour les trois chemins (§ 5.4 bis du plan v2) : la tâche de minuit, le
/// secours à la volée quand un joueur arrive sans défi (E2), et le bouton de l'admin. Ne fait rien si le défi existe.
/// </summary>
/// <param name="Day">Le jour de jeu du défi.</param>
/// <param name="Origin">Qui le génère : enregistré avec le défi.</param>
public sealed record GenerateDailyChallenge(DateOnly Day, ChallengeOrigin Origin);

public enum GenerationOutcome
{
    /// <summary>Le défi a été créé.</summary>
    Created,

    /// <summary>Il existait déjà (une autre génération l'a créé avant, ou tout simplement la tâche de minuit) : rien n'a changé.</summary>
    AlreadyExists,

    /// <summary>Pas assez de morceaux jouables hors cooldown : rien n'a été créé.</summary>
    PoolInsufficient,
}

/// <param name="ChallengeId">Le défi créé ou déjà présent ; vide si le pool est insuffisant.</param>
/// <param name="TrackCount">Les morceaux du défi (0 si le pool est insuffisant).</param>
/// <param name="EligibleCount">Les morceaux que le tirage pouvait choisir (renseigné quand le défi vient d'être tiré).</param>
/// <param name="Requested">Les morceaux demandés par <c>Daily:TracksPerChallenge</c>.</param>
public sealed record GenerateChallengeResult(
    GenerationOutcome Outcome, DateOnly Day, int? ChallengeId, int TrackCount, int EligibleCount, int Requested)
{
    /// <summary>Le compte rendu d'une tâche (Hangfire le garde, <c>GET /api/admin/jobs/{id}</c> le rend).</summary>
    public Dictionary<string, object?> ToReport() => new()
    {
        ["created"] = Outcome == GenerationOutcome.Created,
        ["date"] = Day.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
        ["challengeId"] = ChallengeId,
        ["tracks"] = TrackCount,
    };
}

public static class GenerateDailyChallengeHandler
{
    // Une transaction (celle de Wolverine, AutoApplyTransactions) : le verrou de génération la couvre, et le défi et ses
    // morceaux sont enregistrés ensemble ou pas du tout.
    public static async Task<GenerateChallengeResult> Handle(
        GenerateDailyChallenge command,
        IDailyStore store,
        ITrackDirectory tracks,
        ITrackUsage usage,
        ITrackSelector selector,
        IOptionsMonitor<DailyOptions> options,
        ILogger<GenerateDailyChallenge> logger,
        CancellationToken ct)
    {
        var day = command.Day;
        var requested = options.CurrentValue.EffectiveTracksPerChallenge;
        if (requested != options.CurrentValue.TracksPerChallenge)
            DailyLog.InvalidTracksPerChallenge(logger, options.CurrentValue.TracksPerChallenge, requested);

        // Deux générations du même jour se croisent : la seconde attend ici que la première ait enregistré.
        await store.LockGenerationAsync(day, ct);

        if (await store.FindChallengeAsync(day, ct) is { } existing)
        {
            DailyLog.ChallengeAlreadyExists(logger, day);
            return new GenerateChallengeResult(GenerationOutcome.AlreadyExists, day, existing.Id, existing.Tracks.Count, 0, requested);
        }

        var candidates = await tracks.ListPlayableIdsAsync(ct);
        var inCooldown = await usage.GetTracksInCooldownAsync(day, ct);
        var selection = selector.Select(candidates, inCooldown, requested, DailyChallenge.SeedOf(day));
        if (!selection.IsSufficient)
        {
            DailyLog.PoolInsufficient(logger, selection.EligibleCount, requested, day);
            return new GenerateChallengeResult(GenerationOutcome.PoolInsufficient, day, null, 0, selection.EligibleCount, requested);
        }

        var challenge = DailyChallenge.Create(day, command.Origin, selection.TrackIds);
        await store.AddAsync(challenge, ct);

        DailyLog.ChallengeGenerated(logger, day, challenge.Tracks.Count, command.Origin);
        return new GenerateChallengeResult(GenerationOutcome.Created, day, challenge.Id, challenge.Tracks.Count, selection.EligibleCount, requested);
    }
}

/// <summary>
/// Tâche <c>daily-generate-challenge</c> (§ 5.4 bis du plan v2) : génère le défi du jour de jeu en cours, chaque nuit à
/// minuit UTC. **Un pool insuffisant lève une exception** : sans elle, Hangfire compterait un succès et ne réessaierait
/// pas ; la tâche réessaie toutes les 10 minutes pendant la journée (144 essais), jusqu'à ce que le pool soit regarni.
/// </summary>
public sealed class GenerateDailyChallengeJob(IMessageBus bus, IGameCalendar calendar) : IScheduledJob
{
    public const string Id = "daily-generate-challenge";
    public const string DefaultCron = "0 0 * * *";

    /// <summary>Un essai toutes les 10 minutes pendant 24 h (le défaut de Hangfire s'arrête à 10 essais).</summary>
    public const int RetryAttempts = 144;

    // Le verrou de génération (en base) protège aussi d'une exécution simultanée ; celui-ci évite d'en empiler deux.
    [DisableConcurrentExecution(timeoutInSeconds: 60)]
    [AutomaticRetry(Attempts = RetryAttempts, DelaysInSeconds = [600])]
    public async Task<object?> RunAsync(CancellationToken cancellationToken) =>
        await GenerateTodayAsync(bus, calendar, ChallengeOrigin.Nightly, cancellationToken);

    internal static async Task<object?> GenerateTodayAsync(
        IMessageBus bus, IGameCalendar calendar, ChallengeOrigin origin, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<GenerateChallengeResult>(new GenerateDailyChallenge(calendar.Today, origin), ct);
        return result.Outcome == GenerationOutcome.PoolInsufficient
            ? throw new JobFailedException(DailyErrorCodes.PoolInsufficient)
            : result.ToReport();
    }
}

/// <summary>
/// Tâche <c>daily-generate-challenge-admin</c> : ce que lance le bouton « Générer le défi du jour » de l'admin. Elle n'a pas
/// de cron (en pause) et **ne réessaie pas** : l'admin voit tout de suite le résultat (ou le code d'erreur) et décide ;
/// elle apparaît dans l'historique de <c>/jobs</c> comme tout lancement. Le défi est marqué « admin ».
/// </summary>
public sealed class GenerateDailyChallengeAdminJob(IMessageBus bus, IGameCalendar calendar) : IScheduledJob
{
    public const string Id = "daily-generate-challenge-admin";

    [DisableConcurrentExecution(timeoutInSeconds: 60)]
    [AutomaticRetry(Attempts = 0)]
    public async Task<object?> RunAsync(CancellationToken cancellationToken) =>
        await GenerateDailyChallengeJob.GenerateTodayAsync(bus, calendar, ChallengeOrigin.Admin, cancellationToken);
}

public static class GenerateDailyChallengeEndpoint
{
    /// <summary>
    /// <c>POST /api/admin/daily/challenges/generate-today</c> : le bouton « Générer le défi du jour ». Déclenche la tâche
    /// (chaque lancement apparaît dans l'historique de <c>/jobs</c>) et répond 202 avec l'exécution à suivre par
    /// <c>GET /api/admin/jobs/{id}</c> : son compte rendu dit si le défi a été créé ou existait déjà, son code d'erreur
    /// <c>admin.pool_insufficient</c> si le pool ne suffit pas.
    /// </summary>
    [WolverinePost("/api/admin/daily/challenges/generate-today", OperationId = "generateToday")]
    public static async Task<JobExecutionResponse> Post(IJobTrigger trigger, CancellationToken ct) =>
        new(await trigger.TriggerAsync(GenerateDailyChallengeAdminJob.Id, ct));
}

internal static partial class DailyLog
{
    [LoggerMessage(EventId = 1303, Level = LogLevel.Warning,
        Message = "Daily:TracksPerChallenge vaut {Configured} : {Used} morceaux utilisés à la place.")]
    public static partial void InvalidTracksPerChallenge(ILogger logger, int configured, int used);

    [LoggerMessage(EventId = 1300, Level = LogLevel.Information,
        Message = "Défi du {Day} généré : {TrackCount} morceaux ({Origin}).")]
    public static partial void ChallengeGenerated(ILogger logger, DateOnly day, int trackCount, ChallengeOrigin origin);

    [LoggerMessage(EventId = 1301, Level = LogLevel.Information,
        Message = "Défi du {Day} déjà présent, génération ignorée.")]
    public static partial void ChallengeAlreadyExists(ILogger logger, DateOnly day);

    // Même niveau que la v1 : c'est ce qui doit alerter. La tâche réessaie, le message se répète tant que le pool manque.
    [LoggerMessage(EventId = 1302, Level = LogLevel.Error,
        Message = "Pool insuffisant : {Eligible} morceau(x) tirable(s), {Required} requis pour le défi du {Day}.")]
    public static partial void PoolInsufficient(ILogger logger, int eligible, int required, DateOnly day);
}
