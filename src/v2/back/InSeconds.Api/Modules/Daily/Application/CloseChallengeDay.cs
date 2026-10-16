using System.Text.Json;
using Hangfire;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Le format JSON de la photo figée : camelCase, comme le reste de l'API.</summary>
public static class DayStatsJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static string Write(DayStatsPayload payload) => JsonSerializer.Serialize(payload, Options);

    public static DayStatsPayload? Read(string json) => JsonSerializer.Deserialize<DayStatsPayload>(json, Options);
}

/// <summary>
/// Fige les statistiques d'un jour **terminé pour de bon** (§ 5.4 du plan v2) : J-2 et avant. Une partie de la veille peut encore se finir après
/// minuit (piège 18), donc la veille et le jour même restent calculés en direct. Idempotent : refait la photo si elle existe déjà.
/// </summary>
public sealed record CloseChallengeDay(DateOnly Day);

public enum CloseOutcome
{
    /// <summary>La photo est faite (ou refaite).</summary>
    Closed,

    /// <summary>Pas de défi ce jour-là.</summary>
    NoChallenge,

    /// <summary>Le jour n'est pas terminé pour de bon : une partie peut encore s'y finir.</summary>
    NotOver,
}

/// <param name="Payload">La photo, vide si elle n'a pas été faite.</param>
public sealed record CloseDayResult(CloseOutcome Outcome, DateOnly Day, DayStatsPayload? Payload, DateTimeOffset? ComputedAt);

public static class CloseChallengeDayHandler
{
    /// <summary>Le dernier jour qu'on peut figer : l'avant-veille.</summary>
    public static DateOnly LastClosableDay(IGameCalendar calendar) => calendar.Today.AddDays(-2);

    public static async Task<CloseDayResult> Handle(
        CloseChallengeDay command, IDailyStore store, IDailyStatsQueries stats, DailyRules rules, IGameCalendar calendar,
        ILogger<CloseChallengeDay> logger, CancellationToken ct)
    {
        if (command.Day > LastClosableDay(calendar))
            return new CloseDayResult(CloseOutcome.NotOver, command.Day, null, null);
        if (await store.FindChallengeAsync(command.Day, ct) is not { } challenge)
            return new CloseDayResult(CloseOutcome.NoChallenge, command.Day, null, null);

        return await CloseAsync(challenge, store, stats, rules, calendar, logger, ct);
    }

    /// <summary>Calcule la photo du défi et l'enregistre (la remplace si elle existe). Dans la transaction de l'appelant.</summary>
    public static async Task<CloseDayResult> CloseAsync(
        DailyChallenge challenge, IDailyStore store, IDailyStatsQueries stats, DailyRules rules, IGameCalendar calendar,
        ILogger logger, CancellationToken ct)
    {
        // La tâche de minuit et un recalcul de l'admin qui se croisent se suivent : la seconde voit la ligne de la première.
        await store.LockDayStatsAsync(challenge.Id, ct);

        var tracks = challenge.Tracks.OrderBy(t => t.Position).Select(t => new ChallengeTrackRef(t.Position, t.TrackId)).ToList();
        var payload = DayStatsCalculator.Build(
            challenge.Date, challenge.Id, isPast: true,
            await stats.GetSessionsAsync(challenge.Id, ct), tracks,
            await stats.GetTrackAggregatesAsync(challenge.Id, completedOnly: false, ct),
            rules.AllowedDurations, rules.Options.EffectiveDurationScores);

        var now = calendar.Now;
        var json = DayStatsJson.Write(payload);
        if (await store.FindDayStatsAsync(challenge.Id, ct) is { } existing)
            existing.Replace(now, (short)DayStatsPayload.CurrentVersion, json);
        else
            store.Add(DayStatsSnapshot.Create(challenge.Id, now, (short)DayStatsPayload.CurrentVersion, json));

        DailyLog.DayClosed(logger, challenge.Date);
        return new CloseDayResult(CloseOutcome.Closed, challenge.Date, payload, now);
    }
}

/// <summary>
/// Tâche <c>daily-close-day</c> (§ 5.4 bis du plan v2, `5 0 * * *`) : expire d'abord les parties restées en cours sur un défi plus vieux que la
/// veille (<see cref="ExpireStaleSessions"/>, revue de E4), puis fige les statistiques de l'avant-veille, et de **tout jour plus ancien resté sans
/// photo** (la tâche n'a pas tourné un soir, ou le jour précède l'import de l'historique). Une étape ou un jour qui échoue n'empêche pas la suite :
/// la tâche échoue à la fin (`admin.close_day_failed`), le reste est fait.
/// </summary>
public sealed class DailyCloseDayJob(IMessageBus bus, IGameCalendar calendar, IDailyStatsQueries stats, ILogger<DailyCloseDayJob> logger) : IScheduledJob
{
    public const string Id = "daily-close-day";
    public const string DefaultCron = "5 0 * * *";

    [DisableConcurrentExecution(timeoutInSeconds: 60)]
    [AutomaticRetry(Attempts = 3, DelaysInSeconds = [600])]
    public async Task<object?> RunAsync(CancellationToken cancellationToken)
    {
        var closed = new List<string>();
        var failed = new List<string>();

        // Les parties abandonnées sans clic (le joueur n'est jamais revenu) : expirées sans attendre son retour. La photo les compte déjà en
        // « expirées » ; l'état en base les rejoint.
        var expired = 0;
        try
        {
            expired = await bus.InvokeAsync<int>(new ExpireStaleSessions(), cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            failed.Add("expire");
            DailyLog.ExpireStaleSessionsFailed(logger, ex);
        }

        var days = await stats.ListUnfrozenChallengesAsync(CloseChallengeDayHandler.LastClosableDay(calendar), cancellationToken);
        foreach (var day in days)
        {
            var label = day.Date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            try
            {
                var result = await bus.InvokeAsync<CloseDayResult>(new CloseChallengeDay(day.Date), cancellationToken);
                if (result.Outcome == CloseOutcome.Closed)
                    closed.Add(label);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Un jour qui échoue (le plus ancien passe toujours en premier) ne doit pas empêcher de figer les suivants, l'avant-veille comprise.
                failed.Add(label);
                DailyLog.CloseDayFailed(logger, ex, label);
            }
        }

        // La tâche échoue **après** avoir figé ce qu'elle pouvait : le jour fautif reste visible dans /jobs et se retente (Hangfire, puis le soir suivant).
        return failed.Count == 0
            // Un dictionnaire : Hangfire n'écrit pas les propriétés à zéro d'un objet.
            ? new Dictionary<string, object?> { ["expired"] = expired, ["closed"] = closed.Count, ["days"] = closed }
            : throw new JobFailedException(DailyAdminErrorCodes.CloseDayFailed);
    }
}

public static class RecomputeDayStatsEndpoint
{
    public static async Task<DailyChallenge?> LoadAsync(string date, IDailyStore store, CancellationToken ct) =>
        DateOnly.TryParseExact(date, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var day)
            ? await store.FindChallengeAsync(day, ct)
            : null;

    public static ProblemDetails Validate(string date, DailyChallenge? challenge, IGameCalendar calendar)
    {
        if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var day))
            return ApiProblem.Of(StatusCodes.Status400BadRequest, DailyAdminErrorCodes.InvalidDate, "La date doit être au format aaaa-mm-jj.");
        if (challenge is null)
            return ApiProblem.Of(StatusCodes.Status404NotFound, ErrorCodes.NotFound, "Aucun défi ce jour-là.");
        return day > CloseChallengeDayHandler.LastClosableDay(calendar)
            ? ApiProblem.Of(StatusCodes.Status409Conflict, DailyAdminErrorCodes.DayNotOver, "Ce jour n'est pas terminé : une partie peut encore s'y finir.")
            : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>POST /api/admin/daily/challenges/{date}/stats/recompute</c> : refait la photo figée d'un jour terminé (J-2 et avant), par exemple après la
    /// correction d'une donnée. 400 date invalide, 404 pas de défi ce jour-là, 409 <c>admin.day_not_over</c> pour la veille et le jour même.
    /// Rend la carte du défi sous la même forme que <c>GET /api/admin/daily/challenges/stats</c> (artiste, titre et pseudo joints) : l'écran
    /// remplace la carte recalculée sans recharger la liste.
    /// </summary>
    [WolverinePost("/api/admin/daily/challenges/{date}/stats/recompute", OperationId = "recomputeDayStats")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static async Task<AdminChallengeStats> Post(
        string date,
        // Chargé par LoadAsync : pas le corps de la requête (ce POST n'en a pas).
        [NotBody] DailyChallenge challenge,
        IDailyStore store,
        IDailyStatsQueries stats,
        ITrackDirectory tracks,
        IPlayerDirectory players,
        // Un service concret : sans [NotBody], Wolverine le prendrait pour le corps de la requête (400 sans message).
        [NotBody] DailyRules rules,
        IGameCalendar calendar,
        ILogger<CloseChallengeDay> logger,
        CancellationToken ct)
    {
        var result = await CloseChallengeDayHandler.CloseAsync(challenge, store, stats, rules, calendar, logger, ct);
        var payload = result.Payload!;
        var trackInfos = await tracks.GetAsync(payload.Tracks.Select(t => t.TrackId).Distinct().ToList(), ct);
        var pseudos = await players.GetPseudosAsync(payload.Players.Select(p => p.PlayerId).Distinct().ToList(), ct);
        return GetChallengeStatsEndpoint.ToResponse(payload, result.ComputedAt, canRecompute: true, trackInfos, pseudos);
    }
}
