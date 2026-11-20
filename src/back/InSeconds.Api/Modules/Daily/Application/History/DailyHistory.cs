using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Le verdict du joueur sur un morceau d'un défi passé : jamais ce qu'il a tapé, ni le morceau lui-même.</summary>
public sealed record DailyHistoryAnswer(int Position, bool ArtistCorrect, bool TitleCorrect);

/// <summary>Une partie terminée du joueur : le jour du défi, son score et ses verdicts.</summary>
public sealed record DailyHistoryGame(DateOnly Date, int Score, IReadOnlyList<DailyHistoryAnswer> Answers);

/// <summary>Le résumé de toutes les parties terminées du joueur : leur nombre, leur moyenne et la meilleure.</summary>
public sealed record DailyHistorySummary(int Count, int? AverageScore, int? BestScore);

/// <summary>Lectures de l'historique d'un joueur sur le défi du jour, en projections directes. Toujours **les parties de ce joueur**, jamais d'un autre.</summary>
public interface IDailyHistoryQueries
{
    Task<DailyHistorySummary> GetSummaryAsync(Guid playerId, CancellationToken ct);

    /// <summary>Les parties terminées dont le défi tombe dans [<paramref name="start"/>, <paramref name="end"/>[, la plus récente d'abord.</summary>
    Task<IReadOnlyList<DailyHistoryGame>> ListGamesAsync(Guid playerId, DateOnly start, DateOnly end, CancellationToken ct);

    /// <summary>Les défis de [<paramref name="start"/>, <paramref name="end"/>[ avec, pour chacun, la partie du joueur (son statut, son score, ses réponses).</summary>
    Task<IReadOnlyList<HistoryCalendarInput>> ListMonthDaysAsync(Guid playerId, DateOnly start, DateOnly end, CancellationToken ct);

    /// <summary>Le jour du tout premier défi ; vide s'il n'y en a aucun.</summary>
    Task<DateOnly?> GetFirstChallengeDateAsync(CancellationToken ct);

    /// <summary>
    /// Ses réponses ratées (selon <paramref name="filter"/>, cf. <see cref="ReplayFilters"/>) sur les défis d'avant <paramref name="before"/> (tous
    /// sans) et jusqu'à <paramref name="lastDay"/>, dans les parties qu'il ne peut plus jouer (tout sauf « en cours ») : celles des
    /// <paramref name="takeDays"/> jours les plus récents qui en ont.
    /// </summary>
    Task<IReadOnlyList<MissedAnswer>> ListMissedAnswersAsync(Guid playerId, DateOnly lastDay, DateOnly? before, string filter, int takeDays, CancellationToken ct);

    /// <summary>Le nombre de ses réponses ratées jusqu'à <paramref name="lastDay"/> (mêmes parties) : rien trouvé, et à moitié.</summary>
    Task<(int None, int Half)> CountMissedAnswersAsync(Guid playerId, DateOnly lastDay, CancellationToken ct);
}

/// <summary>Une case du calendrier de l'historique.</summary>
/// <param name="Date">Le jour du défi.</param>
/// <param name="State">`played` (terminée), `unfinished` (commencée, pas terminée), `missed` (pas jouée) ou `today` (le défi du jour, pas encore terminé).</param>
/// <param name="Score">Le score d'une partie terminée ; vide sinon.</param>
/// <param name="MaxPossibleScore">Nombre de morceaux × meilleur palier : la borne haute de la teinte de la case.</param>
public sealed record DailyHistoryDayResponse(DateOnly Date, string State, int? Score, int MaxPossibleScore);

/// <summary>Un morceau d'une partie de l'historique : sa position et les verdicts, pour les petites barres de la ligne.</summary>
public sealed record DailyHistoryTrackResponse(int Position, bool ArtistCorrect, bool TitleCorrect);

/// <summary>Une ligne de l'historique : un défi joué.</summary>
/// <param name="Date">Le jour du défi.</param>
public sealed record DailyHistoryGameResponse(DateOnly Date, int Score, IReadOnlyList<DailyHistoryTrackResponse> Tracks);

/// <summary>L'historique du joueur sur le défi du jour : le résumé de tout, puis un mois à la fois.</summary>
/// <param name="Month">Le mois lu (`aaaa-mm`).</param>
/// <param name="PreviousMonth">Le mois d'avant qui a un défi (vide : aucun), pour la flèche ‹.</param>
/// <param name="NextMonth">Le mois d'après, s'il n'est pas dans le futur (vide sinon), pour la flèche ›.</param>
/// <param name="PlayedCount">Les parties terminées du joueur, tous mois confondus.</param>
/// <param name="AverageScore">Leur score moyen, tous mois confondus ; vide sans partie.</param>
/// <param name="BestScore">Le meilleur score, tous mois confondus ; vide sans partie.</param>
/// <param name="Games">Les parties terminées du mois, la plus récente d'abord.</param>
/// <param name="Days">Le calendrier du mois : un jour de défi par case, jusqu'à aujourd'hui, du plus ancien au plus récent.</param>
/// <param name="MonthPlayedCount">Les parties terminées du mois.</param>
/// <param name="MonthPublishedCount">Les jours du mois qu'il pouvait jouer : ceux d'avant aujourd'hui, plus aujourd'hui s'il l'a terminé.</param>
/// <param name="MonthAverageScore">Le score moyen du mois ; vide sans partie terminée.</param>
/// <param name="MonthBestScore">Le meilleur score du mois ; vide sans partie terminée.</param>
public sealed record DailyHistoryResponse(
    string Month, string? PreviousMonth, string? NextMonth, int PlayedCount, int? AverageScore, int? BestScore, IReadOnlyList<DailyHistoryGameResponse> Games,
    IReadOnlyList<DailyHistoryDayResponse> Days, int MonthPlayedCount, int MonthPublishedCount, int? MonthAverageScore, int? MonthBestScore);

public static class GetDailyHistoryEndpoint
{
    public static ProblemDetails Validate([FromQuery] string? month) =>
        string.IsNullOrWhiteSpace(month) || GameMonth.TryParse(month, out _)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyErrorCodes.InvalidMonth, "Le mois doit être au format aaaa-mm.");

    /// <summary>
    /// <c>GET /api/daily/history?month=aaaa-mm</c> : l'historique **du joueur de la requête**, un mois à la fois (le mois en cours sans paramètre) :
    /// le calendrier du mois (l'état de chaque jour de défi jusqu'à aujourd'hui), ses chiffres, ses parties terminées et le résumé de toutes ses
    /// parties. Toujours la date du défi (piège 18). Lecture seule, jamais mise en cache ; l'identifiant ne vient que du cookie. Sans identité (un
    /// nouveau venu), le calendrier montre les jours de défi, tous « pas joués », sans rien créer. 400 <c>daily.invalid_month</c>.
    /// </summary>
    [WolverineGet("/api/daily/history", OperationId = "getDailyHistory")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public static async Task<DailyHistoryResponse> Get(
        [FromQuery] string? month, ICurrentPlayer current, IDailyHistoryQueries queries, IGameCalendar calendar, [NotBody] DailyRules rules, CancellationToken ct)
    {
        // Sans identité : un identifiant qu'aucun joueur n'a (aucune partie ne lui revient).
        var playerId = current.PlayerId ?? Guid.Empty;
        var today = calendar.Today;
        var first = GameMonth.TryParse(month, out var parsed) ? parsed : GameMonth.FirstDayOf(today);
        var next = first.AddMonths(1);

        var summary = await queries.GetSummaryAsync(playerId, ct);
        var games = await queries.ListGamesAsync(playerId, first, next, ct);
        var firstChallenge = await queries.GetFirstChallengeDateAsync(ct);
        var best = rules.Options.EffectiveDurationScores.Max(d => d.Score);
        var days = HistoryCalendar.Days(await queries.ListMonthDaysAsync(playerId, first, next, ct), today, best);
        var stats = HistoryCalendar.Stats(days, today);

        return new DailyHistoryResponse(
            GameMonth.Of(first),
            firstChallenge is { } oldest && oldest < first ? GameMonth.Of(first.AddMonths(-1)) : null,
            next <= today ? GameMonth.Of(next) : null,
            summary.Count, summary.AverageScore, summary.BestScore,
            games.Select(g => new DailyHistoryGameResponse(
                g.Date, g.Score, g.Answers.OrderBy(a => a.Position).Select(a => new DailyHistoryTrackResponse(a.Position, a.ArtistCorrect, a.TitleCorrect)).ToList())).ToList(),
            days.Select(d => new DailyHistoryDayResponse(d.Date, d.State, d.Score, d.MaxPossibleScore)).ToList(),
            stats.PlayedCount, stats.PublishedCount, stats.AverageScore, stats.BestScore);
    }
}
