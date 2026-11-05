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

/// <summary>Les chiffres d'un jour (<see cref="DayKpis"/>).</summary>
/// <param name="NewPlayersCount">Joueurs dont c'est la toute première partie (aucune partie sur un défi plus ancien).</param>
/// <param name="AccountsCreatedCount">Comptes créés ce jour-là (jour UTC) et toujours présents.</param>
/// <param name="FirstTimeFinishersCount">Parmi les parties terminées, celles des joueurs dont c'est la toute première partie (le reste : des habitués).</param>
/// <param name="Arrivals">Joueurs créés ce jour-là (jour UTC), par source d'arrivée, la plus fréquente d'abord.</param>
public sealed record DayKpisResponse(
    DateOnly Date, int CompletedCount, int AbandonedCount, int ExpiredCount, int PendingCount, int TotalSessions, double CompletionRate, double? MedianScore,
    int NewPlayersCount, int AccountsCreatedCount, int FirstTimeFinishersCount, IReadOnlyList<ArrivalResponse> Arrivals);

/// <summary>Les joueurs arrivés par une source (<c>instagram</c>, <c>share</c>, <c>direct</c>, un domaine, <c>other</c>).</summary>
public sealed record ArrivalResponse(string Source, int Count);

/// <summary>Des partages du score faits, par format du texte (des totaux, jamais un joueur).</summary>
public sealed record ShareCountsResponse(int Short, int Long);

/// <summary>Les partages du score : le jour demandé, et les 30 derniers jours (aujourd'hui compris).</summary>
public sealed record DashboardSharesResponse(ShareCountsResponse SelectedDay, ShareCountsResponse Last30Days);

/// <param name="DailyActivity">Parties terminées par jour, les 30 derniers jours (aujourd'hui compris), les jours sans partie à 0.</param>
/// <param name="AvailableDates">Les jours qui ont un défi, du plus récent au plus ancien.</param>
/// <param name="SelectedDayKpis">Vide si le jour demandé n'a pas de défi.</param>
/// <param name="Arrivals">Joueurs créés les 30 derniers jours (aujourd'hui compris), par source d'arrivée, la plus fréquente d'abord.</param>
/// <param name="Shares">Partages du score faits, par format : le jour demandé (même sans défi) et les 30 derniers jours.</param>
public sealed record DashboardResponse(
    IReadOnlyList<DailyActivityResponse> DailyActivity, PlayerBreakdownResponse PlayerBreakdown, IReadOnlyList<DateOnly> AvailableDates, DayKpisResponse? SelectedDayKpis,
    IReadOnlyList<ArrivalResponse> Arrivals, DashboardSharesResponse Shares);

public static class GetDashboardEndpoint
{
    public const int ActivityDays = 30;

    public static ProblemDetails Validate([FromQuery] string? date) =>
        string.IsNullOrWhiteSpace(date) || DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyAdminErrorCodes.InvalidDate, "La date doit être au format aaaa-mm-jj.");

    /// <summary>
    /// <c>GET /api/admin/daily/dashboard?date=aaaa-mm-jj</c> : l'activité des 30 derniers jours, les joueurs, les
    /// jours qui ont un défi, les chiffres du jour demandé (aujourd'hui par défaut) et les partages du score par format. Tout est lu en direct, jamais dans la photo figée : ce sont
    /// des comptes, pas le détail d'un défi. Les joueurs effacés n'y figurent pas. Les sources d'arrivée (du jour demandé et des 30 derniers jours)
    /// sont des comptes par source, jamais un joueur.
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
            var newPlayers = await stats.CountFirstTimePlayersAsync(challengeId, ct);
            var accounts = await players.CountAccountsCreatedOnAsync(selected, ct);
            var firstTimeFinishers = await stats.CountFirstTimeFinishersAsync(challengeId, ct);
            var dayArrivals = await players.CountArrivalsBySourceAsync(selected, selected, ct);
            kpis = new DayKpisResponse(
                k.Date, k.CompletedCount, k.AbandonedCount, k.ExpiredCount, k.PendingCount, k.TotalSessions, k.CompletionRate, k.MedianScore, newPlayers, accounts,
                firstTimeFinishers, ToResponse(dayArrivals));
        }

        var arrivals = await players.CountArrivalsBySourceAsync(since, today, ct);
        var shares = new DashboardSharesResponse(
            ToResponse(await stats.GetShareCountsAsync(selected, selected, ct)), ToResponse(await stats.GetShareCountsAsync(since, today, ct)));
        return new DashboardResponse(
            activity,
            new PlayerBreakdownResponse(breakdown.Guests, breakdown.Registered, breakdown.ActiveLast7Days, breakdown.ActiveLast30Days),
            dates, kpis, ToResponse(arrivals), shares);
    }

    private static ShareCountsResponse ToResponse(ShareCounts shares) => new(shares.Short, shares.Long);

    private static List<ArrivalResponse> ToResponse(IReadOnlyList<ArrivalCount> arrivals) =>
        arrivals.Select(a => new ArrivalResponse(a.Source, a.Count)).ToList();
}
