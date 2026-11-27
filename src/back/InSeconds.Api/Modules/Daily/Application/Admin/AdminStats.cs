using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Un jour de défi : les parties par statut, et ses joueurs dont ceux qui jouent leur toute première partie (les autres sont des habitués).</summary>
public sealed record StatsDayResponse(DateOnly Date, int Completed, int Abandoned, int Expired, int Players, int FirstTimePlayers);

/// <summary>Un groupe de joueurs arrivés et leur retour (<see cref="CohortRow"/>) : <c>Key</c> est la source, la classe d'appareil, ou « all ».</summary>
public sealed record StatsCohortResponse(string Key, int New, int Day1Eligible, int Day1Returned, int Day7Eligible, int Day7Returned);

/// <summary>Le nombre de réponses données à un palier d'écoute (secondes).</summary>
public sealed record StatsListenedResponse(decimal Seconds, int Count);

/// <summary>Les réponses de la période, tous statuts de partie confondus.</summary>
public sealed record StatsAnswersResponse(int Total, int ArtistFound, int TitleFound, int WithHint, IReadOnlyList<StatsListenedResponse> ByListened);

/// <param name="Days">La période demandée : 7, 30 ou 90 jours, aujourd'hui compris.</param>
/// <param name="Daily">Un point par jour de défi qui a des parties, du plus ancien au plus récent (les jours sans partie sont absents).</param>
/// <param name="MedianScore">Médiane des scores des parties terminées de la période ; vide sans partie terminée.</param>
/// <param name="Overall">Tous les joueurs arrivés sur la période.</param>
/// <param name="Sources">Les arrivés par source d'arrivée, le plus nombreux d'abord (les joueurs sans source notée n'y figurent pas).</param>
/// <param name="Devices">Les arrivés par classe d'appareil (<c>phone</c>, <c>tablet</c>, <c>desktop</c>), le plus nombreux d'abord.</param>
public sealed record StatsResponse(
    int Days, IReadOnlyList<StatsDayResponse> Daily, double? MedianScore, StatsCohortResponse Overall, IReadOnlyList<StatsCohortResponse> Sources,
    IReadOnlyList<StatsCohortResponse> Devices, StatsAnswersResponse Answers);

public static class GetStatsEndpoint
{
    public static readonly IReadOnlyList<int> Periods = [7, 30, 90];

    public static ProblemDetails Validate([FromQuery] int? days) =>
        days is null || Periods.Contains(days.Value)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyAdminErrorCodes.InvalidPeriod, "La période doit être de 7, 30 ou 90 jours.");

    /// <summary>
    /// <c>GET /api/admin/daily/stats?days=30</c> : l'onglet Stats de l'admin. Les parties par jour, la médiane des scores, les réponses, et les
    /// joueurs arrivés sur la période par source et par appareil avec leur retour à J+1 et J+7. Tout est lu en direct, en comptes : jamais un joueur,
    /// ni un texte saisi. Les joueurs effacés n'y figurent pas.
    /// </summary>
    [WolverineGet("/api/admin/daily/stats", OperationId = "getStats")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public static async Task<StatsResponse> Get([FromQuery] int? days, IDailyStatsQueries stats, IPlayerDirectory players, IGameCalendar calendar, CancellationToken ct)
    {
        var period = days ?? 30;
        var today = calendar.Today;
        var since = today.AddDays(-(period - 1));

        var daily = (await stats.GetSessionCountsByDayAsync(since, ct))
            .Select(d => new StatsDayResponse(d.Date, d.Completed, d.Abandoned, d.Expired, d.Players, d.FirstTimePlayers))
            .ToList();
        var scores = await stats.GetCompletedScoresSinceAsync(since, ct);
        var answers = await stats.GetAnswerTotalsSinceAsync(since, ct);

        var arrivals = await players.ListArrivalsAsync(since, today, ct);
        var played = await stats.GetPlayedDatesAsync(arrivals.Select(a => a.PlayerId).ToList(), since, today, ct);
        var overall = ReturnCohorts.Build("all", arrivals, played, today);
        var bySource = ReturnCohorts.By(arrivals, played, today, a => a.Source);
        var byDevice = ReturnCohorts.By(arrivals, played, today, a => a.DeviceClass);

        return new StatsResponse(
            period, daily, Medians.Decimal(scores), ToResponse(overall), bySource.Select(ToResponse).ToList(), byDevice.Select(ToResponse).ToList(),
            new StatsAnswersResponse(
                answers.Total, answers.ArtistFound, answers.TitleFound, answers.WithHint,
                answers.ByListened.OrderBy(x => x.Key).Select(x => new StatsListenedResponse(x.Key, x.Value)).ToList()));
    }

    private static StatsCohortResponse ToResponse(CohortRow r) => new(r.Key, r.New, r.Day1Eligible, r.Day1Returned, r.Day7Eligible, r.Day7Returned);
}
