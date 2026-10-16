using System.Globalization;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Parties terminées un jour : un point de l'activité des 30 derniers jours.</summary>
public sealed record DailyActivityResponse(DateOnly Date, int PlayerCount);

/// <summary>Les joueurs non supprimés : invités, comptes, et ceux vus récemment (invités compris).</summary>
public sealed record PlayerBreakdownResponse(int TotalGuests, int TotalRegistered, int ActiveLast7Days, int ActiveLast30Days);

/// <summary>Les chiffres d'un jour, comme la v1 (<see cref="DayKpis"/>).</summary>
public sealed record DayKpisResponse(
    DateOnly Date, int CompletedCount, int AbandonedCount, int ExpiredCount, int PendingCount, int TotalSessions, double CompletionRate, double? MedianScore);

/// <param name="DailyActivity">Parties terminées par jour, les 30 derniers jours (aujourd'hui compris), les jours sans partie à 0.</param>
/// <param name="AvailableDates">Les jours qui ont un défi, du plus récent au plus ancien.</param>
/// <param name="SelectedDayKpis">Vide si le jour demandé n'a pas de défi.</param>
public sealed record DashboardResponse(
    IReadOnlyList<DailyActivityResponse> DailyActivity, PlayerBreakdownResponse PlayerBreakdown, IReadOnlyList<DateOnly> AvailableDates, DayKpisResponse? SelectedDayKpis);

public static class GetDashboardEndpoint
{
    public const int ActivityDays = 30;

    public static ProblemDetails Validate([FromQuery] string? date) =>
        string.IsNullOrWhiteSpace(date) || DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyAdminErrorCodes.InvalidDate, "La date doit être au format aaaa-mm-jj.");

    /// <summary>
    /// <c>GET /api/admin/daily/dashboard?date=aaaa-mm-jj</c> (v1 : <c>GET /api/admin/stats</c>) : l'activité des 30 derniers jours, les joueurs, les
    /// jours qui ont un défi et les chiffres du jour demandé (aujourd'hui par défaut). Tout est lu en direct, jamais dans la photo figée : ce sont
    /// des comptes, pas le détail d'un défi. Les joueurs supprimés n'y figurent pas (R8).
    /// </summary>
    [WolverineGet("/api/admin/daily/dashboard", OperationId = "getDashboard")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public static async Task<DashboardResponse> Get(
        [FromQuery] string? date, IDailyStatsQueries stats, IPlayerDirectory players, IGameCalendar calendar, CancellationToken ct)
    {
        var today = calendar.Today;
        var selected = string.IsNullOrWhiteSpace(date)
            ? today
            : DateOnly.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture);

        var since = today.AddDays(-(ActivityDays - 1));
        var counts = await stats.GetCompletedCountsByDayAsync(since, ct);
        var activity = Enumerable.Range(0, ActivityDays)
            .Select(i => since.AddDays(i))
            .Select(d => new DailyActivityResponse(d, counts.GetValueOrDefault(d)))
            .ToList();

        var breakdown = await players.GetBreakdownAsync(calendar.Now, ct);
        var dates = await stats.ListChallengeDatesAsync(ct);

        DayKpisResponse? kpis = null;
        if (await stats.FindChallengeIdAsync(selected, ct) is { } challengeId)
        {
            var k = DayKpisCalculator.Build(selected, await stats.GetSessionsAsync(challengeId, ct), isPast: selected < today);
            kpis = new DayKpisResponse(k.Date, k.CompletedCount, k.AbandonedCount, k.ExpiredCount, k.PendingCount, k.TotalSessions, k.CompletionRate, k.MedianScore);
        }

        return new DashboardResponse(
            activity,
            new PlayerBreakdownResponse(breakdown.Guests, breakdown.Registered, breakdown.ActiveLast7Days, breakdown.ActiveLast30Days),
            dates, kpis);
    }
}
