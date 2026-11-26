using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Lectures de l'historique d'un joueur sur le défi du jour, en projections directes. Toujours **les parties de ce joueur**, jamais d'un autre.</summary>
public interface IDailyHistoryQueries
{
    /// <summary>
    /// Les défis de [<paramref name="start"/>, <paramref name="end"/>[ avec, pour chacun, la partie du joueur (son statut, son score, ses réponses) ;
    /// sans joueur (<paramref name="playerId"/> vide), les défis seuls.
    /// </summary>
    Task<IReadOnlyList<HistoryCalendarInput>> ListMonthDaysAsync(Guid? playerId, DateOnly start, DateOnly end, CancellationToken ct);

    /// <summary>
    /// Sa réponse qui a rapporté le plus de points sur les défis de [<paramref name="start"/>, <paramref name="end"/>[, dans ses parties terminées (la plus
    /// ancienne en cas d'égalité) ; vide sans réponse notée.
    /// </summary>
    Task<BestAnswer?> GetBestAnswerAsync(Guid playerId, DateOnly start, DateOnly end, CancellationToken ct);

    /// <summary>
    /// Ce que l'accueil d'un habitué dit de ses parties terminées : celle d'hier (<paramref name="yesterday"/>), sa moyenne de toujours et, sur les
    /// sept jours jusqu'à hier, ses parties et ses morceaux trouvés (artiste et titre) au premier palier (<paramref name="firstStepSeconds"/>).
    /// </summary>
    Task<ReturnRecapRow> GetReturnRecapAsync(Guid playerId, DateOnly yesterday, decimal firstStepSeconds, CancellationToken ct);

    /// <summary>Le jour du tout premier défi ; vide s'il n'y en a aucun.</summary>
    Task<DateOnly?> GetFirstChallengeDateAsync(CancellationToken ct);

    /// <summary>
    /// Ses réponses ratées (selon <paramref name="filter"/>) sur les défis d'avant <paramref name="before"/> (tous sans) et jusqu'à
    /// <paramref name="lastDay"/>, dans les parties qu'il ne peut plus jouer (tout sauf « en cours ») : celles des <paramref name="takeDays"/> jours
    /// les plus récents qui en ont.
    /// </summary>
    Task<IReadOnlyList<MissedAnswer>> ListMissedAnswersAsync(Guid playerId, DateOnly lastDay, DateOnly? before, ReplayFilter filter, int takeDays, CancellationToken ct);

    /// <summary>
    /// Le nombre de ses réponses ratées jusqu'à <paramref name="lastDay"/> (mêmes parties) : rien trouvé, et à moitié. Un morceau retiré du catalogue
    /// depuis y compte encore, alors que la liste le saute (il n'a plus de nom) : le compteur peut dépasser d'autant la liste.
    /// </summary>
    Task<(int None, int Half)> CountMissedAnswersAsync(Guid playerId, DateOnly lastDay, CancellationToken ct);
}

/// <summary>Les chiffres bruts de l'accueil d'un habitué (voir <see cref="IDailyHistoryQueries.GetReturnRecapAsync"/>).</summary>
public sealed record ReturnRecapRow(int? YesterdayScore, int? AverageScore, int WeekGames, int WeekFirstStepFound);

/// <summary>Une case du calendrier de l'historique.</summary>
/// <param name="Date">Le jour du défi.</param>
/// <param name="State">
/// `played` (terminée), `unfinished` (commencée, plus jouable), `resumable` (la veille encore en cours : elle se finit sur le défi), `missed` (pas
/// jouée) ou `today` (le défi du jour, pas encore terminé).
/// </param>
/// <param name="Score">Le score d'une partie terminée ; vide sinon.</param>
/// <param name="MaxPossibleScore">Nombre de morceaux × meilleur palier : la borne haute de la teinte de la case.</param>
public sealed record DailyHistoryDayResponse(DateOnly Date, string State, int? Score, int MaxPossibleScore);

/// <summary>L'historique du joueur sur le défi du jour : le calendrier d'un mois et ses chiffres.</summary>
/// <param name="Month">Le mois lu (`aaaa-mm`).</param>
/// <param name="PreviousMonth">Le mois d'avant qui a un défi (vide : aucun), pour la flèche ‹.</param>
/// <param name="NextMonth">Le mois d'après, s'il n'est pas dans le futur (vide sinon), pour la flèche ›.</param>
/// <param name="Days">Le calendrier du mois : un jour de défi par case, jusqu'à aujourd'hui, du plus ancien au plus récent.</param>
/// <param name="MonthPlayedCount">Les parties terminées du mois.</param>
/// <param name="MonthPublishedCount">Les jours du mois qu'il pouvait jouer : ceux d'avant aujourd'hui, plus aujourd'hui s'il l'a terminé.</param>
/// <param name="MonthAverageScore">Le score moyen du mois ; vide sans partie terminée.</param>
/// <param name="MonthBestScore">Le meilleur score du mois ; vide sans partie terminée.</param>
public sealed record DailyHistoryResponse(
    string Month, string? PreviousMonth, string? NextMonth,
    IReadOnlyList<DailyHistoryDayResponse> Days, int MonthPlayedCount, int MonthPublishedCount, int? MonthAverageScore, int? MonthBestScore);

public static class GetDailyHistoryEndpoint
{
    public static ProblemDetails Validate([FromQuery] string? month) =>
        string.IsNullOrWhiteSpace(month) || GameMonth.TryParse(month, out _)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyErrorCodes.InvalidMonth, "Le mois doit être au format aaaa-mm.");

    /// <summary>
    /// <c>GET /api/daily/history?month=aaaa-mm</c> : l'historique **du joueur de la requête**, un mois à la fois (le mois en cours sans paramètre) :
    /// le calendrier du mois (l'état de chaque jour de défi jusqu'à aujourd'hui) et ses chiffres. Toujours la date du défi (piège 18). Lecture seule,
    /// jamais mise en cache ; l'identifiant ne vient que du cookie. Sans identité (un nouveau venu), le calendrier montre les jours de défi, tous
    /// « pas joués », sans rien créer. 400 <c>daily.invalid_month</c>.
    /// </summary>
    [WolverineGet("/api/daily/history", OperationId = "getDailyHistory")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public static async Task<DailyHistoryResponse> Get(
        [FromQuery] string? month, ICurrentPlayer current, IDailyHistoryQueries queries, IGameCalendar calendar, [NotBody] DailyRules rules, CancellationToken ct)
    {
        var today = calendar.Today;
        var first = GameMonth.TryParse(month, out var parsed) ? parsed : GameMonth.FirstDayOf(today);
        var next = first.AddMonths(1);

        var firstChallenge = await queries.GetFirstChallengeDateAsync(ct);
        var best = rules.Options.EffectiveDurationScores.Max(d => d.Score);
        var days = HistoryCalendar.Days(await queries.ListMonthDaysAsync(current.PlayerId, first, next, ct), today, best);
        var stats = HistoryCalendar.Stats(days, today);

        return new DailyHistoryResponse(
            GameMonth.Of(first),
            firstChallenge is { } oldest && oldest < first ? GameMonth.Of(first.AddMonths(-1)) : null,
            next <= today ? GameMonth.Of(next) : null,
            [.. days.Select(d => new DailyHistoryDayResponse(d.Date, HistoryDayState.Of(d.State), d.Score, d.MaxPossibleScore))],
            stats.PlayedCount, stats.PublishedCount, stats.AverageScore, stats.BestScore);
    }
}

/// <summary>Les états d'une case du calendrier, en chaînes stables : le front les lit.</summary>
public static class HistoryDayState
{
    public static string Of(HistoryDayKind kind) => kind switch
    {
        HistoryDayKind.Played => "played",
        HistoryDayKind.Unfinished => "unfinished",
        HistoryDayKind.Resumable => "resumable",
        HistoryDayKind.Missed => "missed",
        HistoryDayKind.Today => "today",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };
}
