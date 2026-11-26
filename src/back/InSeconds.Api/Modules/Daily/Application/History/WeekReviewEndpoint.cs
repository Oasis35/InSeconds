using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Le meilleur morceau d'une période : le jour du défi, la position, le morceau et ses points.</summary>
public sealed record BestAnswer(DateOnly Date, int Position, int TrackId, int Score);

/// <summary>Un jour de la semaine passée dans le bilan.</summary>
/// <param name="Score">Le score d'une partie terminée ; vide sinon (pas jouée, abandonnée, expirée).</param>
public sealed record WeekReviewDayResponse(DateOnly Date, int? Score);

/// <summary>Le meilleur morceau de la semaine : celui qui a rapporté le plus de points (il est déjà révélé : la partie est terminée et publiée).</summary>
public sealed record WeekBestTrackResponse(DateOnly Date, string Artist, string Title, int Score);

/// <summary>Le bilan de la semaine passée du joueur (du lundi au dimanche).</summary>
/// <param name="WeekStart">Le lundi de la semaine.</param>
/// <param name="Days">Les sept jours, du lundi au dimanche.</param>
/// <param name="MaxPossibleScore">Nombre de morceaux × meilleur palier : la borne haute des barres.</param>
/// <param name="PlayedCount">Les parties terminées de la semaine.</param>
/// <param name="AverageScore">La moyenne de ses parties terminées ; vide sans partie.</param>
/// <param name="BestDay">Le jour du meilleur score ; vide sans partie.</param>
/// <param name="BestScore">Le meilleur score ; vide sans partie.</param>
/// <param name="BestTrack">Le morceau qui a rapporté le plus de points ; vide sans partie (ou si le morceau a quitté le catalogue).</param>
public sealed record WeekReviewResponse(
    DateOnly WeekStart, IReadOnlyList<WeekReviewDayResponse> Days, int MaxPossibleScore, int PlayedCount, int? AverageScore,
    DateOnly? BestDay, int? BestScore, WeekBestTrackResponse? BestTrack);

public static class GetWeekReviewEndpoint
{
    /// <summary>
    /// <c>GET /api/daily/week-review</c> : le bilan de la semaine passée (lundi au dimanche) **du joueur de la requête** : ses sept scores, ses jours
    /// joués, sa moyenne, son meilleur jour et son meilleur morceau. Calculé à la lecture sur ses parties terminées et la date du défi (piège 18),
    /// rien de stocké, jamais les données d'un autre joueur. La semaine est entièrement publiée (jusqu'au dimanche, la veille au plus tard un lundi),
    /// donc le morceau montré est déjà révélé par sa propre partie (piège 31). 401.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/daily/week-review", OperationId = "getWeekReview")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<WeekReviewResponse> Get(
        ICurrentPlayer current, IDailyHistoryQueries queries, ITrackDirectory directory, IGameCalendar calendar, [NotBody] DailyRules rules, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var weekStart = WeekReview.StartOfLastWeek(calendar.Today);
        var weekEnd = weekStart.AddDays(WeekReview.DaysInWeek);
        var best = rules.Options.EffectiveDurationScores.Max(d => d.Score);

        var calendarDays = HistoryCalendar.Days(await queries.ListMonthDaysAsync(playerId, weekStart, weekEnd, ct), calendar.Today, best);
        var days = WeekReview.Days(weekStart, calendarDays);
        var stats = WeekReview.Stats(days);
        var maxPossible = calendarDays.Count > 0 ? calendarDays.Max(d => d.MaxPossibleScore) : 0;

        WeekBestTrackResponse? bestTrack = null;
        if (stats.PlayedCount > 0 && await queries.GetBestAnswerAsync(playerId, weekStart, weekEnd, ct) is { } answer)
        {
            var infos = await directory.GetAsync([answer.TrackId], ct);
            // Un morceau retiré du catalogue depuis n'a plus de nom : il est sauté.
            if (infos.TryGetValue(answer.TrackId, out var info))
                bestTrack = new WeekBestTrackResponse(answer.Date, info.Artist, info.DisplayTitle, answer.Score);
        }

        return new WeekReviewResponse(
            weekStart, [.. days.Select(d => new WeekReviewDayResponse(d.Date, d.Score))], maxPossible, stats.PlayedCount, stats.AverageScore,
            stats.BestDay, stats.BestScore, bestTrack);
    }
}
