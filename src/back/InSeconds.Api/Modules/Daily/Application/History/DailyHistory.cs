using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authorization;
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

    /// <summary>Les jours de défi où le joueur a une partie terminée, du plus récent au plus ancien.</summary>
    Task<IReadOnlyList<DateOnly>> ListPlayedDatesAsync(Guid playerId, CancellationToken ct);

    /// <summary>Les parties terminées dont le défi tombe dans [<paramref name="start"/>, <paramref name="end"/>[, la plus récente d'abord.</summary>
    Task<IReadOnlyList<DailyHistoryGame>> ListGamesAsync(Guid playerId, DateOnly start, DateOnly end, CancellationToken ct);
}

/// <summary>Un morceau d'une partie de l'historique : sa position et les verdicts, pour les petites barres de la ligne.</summary>
public sealed record DailyHistoryTrackResponse(int Position, bool ArtistCorrect, bool TitleCorrect);

/// <summary>Une ligne de l'historique : un défi joué.</summary>
/// <param name="Date">Le jour du défi.</param>
public sealed record DailyHistoryGameResponse(DateOnly Date, int Score, IReadOnlyList<DailyHistoryTrackResponse> Tracks);

/// <summary>L'historique du joueur sur le défi du jour : le résumé de tout, puis un mois à la fois.</summary>
/// <param name="Month">Le mois lu (`aaaa-mm`).</param>
/// <param name="PreviousMonth">Le mois d'avant qui a une partie (vide : aucun), pour la flèche ‹.</param>
/// <param name="NextMonth">Le mois d'après qui a une partie (vide : aucun), pour la flèche ›.</param>
/// <param name="PlayedCount">Les parties terminées du joueur, tous mois confondus.</param>
/// <param name="AverageScore">Leur score moyen, tous mois confondus ; vide sans partie.</param>
/// <param name="BestScore">Le meilleur score, tous mois confondus ; vide sans partie.</param>
/// <param name="Games">Les parties du mois, la plus récente d'abord.</param>
public sealed record DailyHistoryResponse(
    string Month, string? PreviousMonth, string? NextMonth, int PlayedCount, int? AverageScore, int? BestScore, IReadOnlyList<DailyHistoryGameResponse> Games);

public static class GetDailyHistoryEndpoint
{
    public static ProblemDetails Validate([FromQuery] string? month) =>
        string.IsNullOrWhiteSpace(month) || GameMonth.TryParse(month, out _)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyErrorCodes.InvalidMonth, "Le mois doit être au format aaaa-mm.");

    /// <summary>
    /// <c>GET /api/daily/history?month=aaaa-mm</c> : les défis que **le joueur de la requête** a terminés, un mois à la fois (le mois en cours sans
    /// paramètre), avec le résumé de toutes ses parties. Lecture seule, jamais mise en cache ; l'identifiant ne vient que du cookie. Une partie
    /// abandonnée ou expirée n'y est pas (pas de score). 400 <c>daily.invalid_month</c>, 401 sans identité.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/daily/history", OperationId = "getDailyHistory")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<DailyHistoryResponse> Get([FromQuery] string? month, ICurrentPlayer current, IDailyHistoryQueries queries, IGameCalendar calendar, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var first = GameMonth.TryParse(month, out var parsed) ? parsed : GameMonth.FirstDayOf(calendar.Today);
        var next = first.AddMonths(1);

        var summary = await queries.GetSummaryAsync(playerId, ct);
        var played = await queries.ListPlayedDatesAsync(playerId, ct);
        var games = await queries.ListGamesAsync(playerId, first, next, ct);

        return new DailyHistoryResponse(
            GameMonth.Of(first),
            played.Where(d => d < first).Select(GameMonth.Of).FirstOrDefault(),
            played.Where(d => d >= next).Select(GameMonth.Of).LastOrDefault(),
            summary.Count, summary.AverageScore, summary.BestScore,
            games.Select(g => new DailyHistoryGameResponse(
                g.Date, g.Score, g.Answers.OrderBy(a => a.Position).Select(a => new DailyHistoryTrackResponse(a.Position, a.ArtistCorrect, a.TitleCorrect)).ToList())).ToList());
    }
}
