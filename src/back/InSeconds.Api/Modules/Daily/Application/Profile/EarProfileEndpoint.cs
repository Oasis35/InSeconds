using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Lectures du profil d'oreille : les parties du joueur et les agrégats de tous les joueurs, en projections directes.</summary>
public interface IDailyProfileQueries
{
    /// <summary>Ses parties terminées dont le défi tombe à partir de <paramref name="since"/> (jusqu'à aujourd'hui).</summary>
    Task<IReadOnlyList<DatedScore>> ListScoresAsync(Guid playerId, DateOnly since, CancellationToken ct);

    /// <summary>Les parties terminées de tous les joueurs, par jour de défi, à partir de <paramref name="since"/>.</summary>
    Task<IReadOnlyList<DayTotal>> ListDayTotalsAsync(DateOnly since, CancellationToken ct);

    /// <summary>
    /// Le décompte des réponses à partir de <paramref name="since"/>, dans les parties qu'on ne peut plus jouer (tout sauf « en cours ») : les siennes
    /// (<paramref name="playerId"/>), ou celles de tous les joueurs (vide).
    /// </summary>
    Task<AnswerTally> GetAnswerTallyAsync(Guid? playerId, DateOnly since, CancellationToken ct);

    /// <summary>Le jour de sa première partie terminée ; vide s'il n'en a pas.</summary>
    Task<DateOnly?> GetFirstGameDateAsync(Guid playerId, CancellationToken ct);

    /// <summary>Sa plus longue série (0 sans série).</summary>
    Task<int> GetBestStreakAsync(Guid playerId, CancellationToken ct);
}

/// <summary>Un point de la courbe : la semaine (ou le mois) qui commence à <c>Start</c>.</summary>
/// <param name="Average">Sa moyenne sur ce point ; vide s'il n'y a pas joué.</param>
/// <param name="PlayersAverage">La moyenne de tous les joueurs ; vide sous 5 parties.</param>
/// <param name="Games">Ses parties terminées sur ce point.</param>
public sealed record EarProfilePointResponse(DateOnly Start, int? Average, int? PlayersAverage, int Games);

/// <summary>Une colonne de « Quand tu trouves ».</summary>
/// <param name="Percent">La part de ses réponses trouvées (artiste ou titre) à ce palier.</param>
/// <param name="PlayersPercent">La même part pour tous les joueurs ; vide sous 100 réponses.</param>
public sealed record EarProfileStepResponse(decimal Seconds, int Percent, int? PlayersPercent);

/// <summary>Le profil d'oreille du joueur sur une période.</summary>
/// <param name="Period">`8w` (8 semaines, un point par semaine), `6m` (6 mois) ou `all` (depuis sa première partie), un point par mois.</param>
/// <param name="AverageScore">Sa moyenne sur la période ; vide sans partie.</param>
/// <param name="TrendPercent">Sa moyenne des 28 derniers jours contre les 28 d'avant, en % ; vide s'il manque des parties d'un côté.</param>
/// <param name="GamesPlayed">Ses parties terminées sur la période.</param>
/// <param name="BestScore">Son meilleur score sur la période ; vide sans partie.</param>
/// <param name="BestStreak">Sa plus longue série, toutes périodes confondues.</param>
/// <param name="FirstStepSeconds">Le premier palier d'écoute (0,5 s).</param>
/// <param name="FirstStepFound">Ses réponses trouvées au premier palier sur la période.</param>
/// <param name="NotFoundPercent">La part de ses réponses où il n'a rien trouvé ; vide sans réponse.</param>
/// <param name="PlayersNotFoundPercent">La même part pour tous les joueurs ; vide sous 100 réponses.</param>
/// <param name="ArtistFoundPercent">La part de ses réponses où il a trouvé l'artiste ; vide sans réponse.</param>
/// <param name="TitleFoundPercent">La part de ses réponses où il a trouvé le titre ; vide sans réponse.</param>
/// <param name="PlayersArtistFoundPercent">La même part pour tous les joueurs ; vide sous 100 réponses.</param>
/// <param name="PlayersTitleFoundPercent">La même part pour tous les joueurs ; vide sous 100 réponses.</param>
public sealed record EarProfileResponse(
    string Period,
    IReadOnlyList<EarProfilePointResponse> Points,
    int? AverageScore,
    int? TrendPercent,
    int GamesPlayed,
    int? BestScore,
    int BestStreak,
    decimal FirstStepSeconds,
    int FirstStepFound,
    IReadOnlyList<EarProfileStepResponse> Steps,
    int? NotFoundPercent,
    int? PlayersNotFoundPercent,
    int? ArtistFoundPercent,
    int? TitleFoundPercent,
    int? PlayersArtistFoundPercent,
    int? PlayersTitleFoundPercent);

public static class GetEarProfileEndpoint
{
    public static ProblemDetails Validate([FromQuery] string? period) =>
        ProfilePeriods.IsKnown(period)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyErrorCodes.InvalidPeriod, "La période doit être 8w, 6m ou all.");

    /// <summary>
    /// <c>GET /api/daily/profile?period=8w|6m|all</c> : le profil d'oreille **du joueur de la requête** : la courbe de ses moyennes à côté de celle
    /// des joueurs, sa meilleure série, ses trouvés au premier palier, ses parties, son meilleur score, la part de ses réponses par palier, ses parts
    /// d'artistes et de titres trouvés, chaque fois comparées à tous les joueurs (jamais sous 5 parties ni sous 100 réponses). Calculé à la lecture,
    /// rien de stocké en plus de la série ; jamais un chiffre sur un joueur nommé. 400 <c>daily.invalid_period</c>, 401 sans identité.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/daily/profile", OperationId = "getEarProfile")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<EarProfileResponse> Get(
        [FromQuery] string? period, ICurrentPlayer current, IDailyProfileQueries queries, IGameCalendar calendar, [NotBody] DailyRules rules, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var today = calendar.Today;
        var chosen = period ?? ProfilePeriods.EightWeeks;
        var start = EarProfile.PeriodStart(chosen, today, await queries.GetFirstGameDateAsync(playerId, ct));
        // La tendance compare 28 jours aux 28 d'avant : on lit assez loin pour elle, quelle que soit la période.
        var trendStart = EarProfile.TrendReadStart(today);
        var readFrom = start < trendStart ? start : trendStart;

        var scores = await queries.ListScoresAsync(playerId, readFrom, ct);
        var inPeriod = scores.Where(s => s.Date >= start).ToList();
        var players = await queries.ListDayTotalsAsync(start, ct);
        var mine = await queries.GetAnswerTallyAsync(playerId, start, ct);
        var everyone = await queries.GetAnswerTallyAsync(null, start, ct);
        var durations = rules.Options.EffectiveAllowedDurationsSeconds.Order().ToList();
        var (steps, notFound, playersNotFound) = EarProfile.Steps(durations, mine, everyone);
        var playersShown = everyone.Total >= AnswerSpeedHistory.MinAnswers;

        return new EarProfileResponse(
            chosen,
            [.. EarProfile.Points(chosen, start, today, inPeriod, players).Select(p => new EarProfilePointResponse(p.Start, p.Average, p.PlayersAverage, p.Games))],
            inPeriod.Count == 0 ? null : (int)Math.Round(inPeriod.Average(s => s.Score), MidpointRounding.AwayFromZero),
            EarProfile.TrendPercent(scores, today),
            inPeriod.Count,
            inPeriod.Count == 0 ? null : inPeriod.Max(s => s.Score),
            await queries.GetBestStreakAsync(playerId, ct),
            durations[0],
            mine.FoundBySeconds.GetValueOrDefault(durations[0]),
            [.. steps.Select(s => new EarProfileStepResponse(s.Seconds, s.Percent, s.PlayersPercent))],
            notFound,
            playersNotFound,
            EarProfile.Percent(mine.ArtistFound, mine.Total),
            EarProfile.Percent(mine.TitleFound, mine.Total),
            playersShown ? EarProfile.Percent(everyone.ArtistFound, everyone.Total) : null,
            playersShown ? EarProfile.Percent(everyone.TitleFound, everyone.Total) : null);
    }
}
