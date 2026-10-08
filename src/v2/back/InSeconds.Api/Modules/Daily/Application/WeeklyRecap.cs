using System.Globalization;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

public static class WeeklyRecapStatus
{
    public const string Ok = "ok";

    /// <summary>Aucun morceau n'a atteint le minimum de réponses sur la période : pas de story à produire. Un statut, pas une erreur.</summary>
    public const string InsufficientData = "insufficient_data";
}

/// <param name="SuccessRatePercent">Part des réponses où l'artiste **et** le titre sont justes.</param>
public sealed record WeeklyTrackResponse(string Artist, string Title, double SuccessRatePercent, int Answers);

/// <param name="MostMissed">Vide si un seul morceau est éligible (ce serait le même que le plus trouvé).</param>
public sealed record WeeklyRecapResponse(
    string Status, DateOnly From, DateOnly To, int MinAnswers, WeeklyTrackResponse? MostFound, WeeklyTrackResponse? MostMissed);

/// <summary>Le morceau le plus trouvé et le plus raté d'une période (v1 : <c>GetWeeklyRecap</c>), pour les stories Instagram de l'admin.</summary>
public static class WeeklyRecapRules
{
    public const int PeriodDays = 7;
    public const int MinAnswers = 3;
    public const int MaxPeriodDays = 366;

    /// <summary>
    /// La période demandée : bornes absentes, <c>to</c> = aujourd'hui et <c>from</c> = <c>to</c> − 6 jours. <c>admin.invalid_date</c> si un format n'est
    /// pas aaaa-mm-jj, <c>admin.invalid_period</c> si <c>from</c> dépasse <c>to</c> ou si la période dépasse <see cref="MaxPeriodDays"/> jours.
    /// </summary>
    public static bool TryResolvePeriod(string? fromRaw, string? toRaw, DateOnly today, out DateOnly from, out DateOnly to, out string? errorCode)
    {
        from = to = default;
        errorCode = null;
        DateOnly? parsedFrom = null, parsedTo = null;
        if (!TryParse(fromRaw, ref parsedFrom) || !TryParse(toRaw, ref parsedTo))
        {
            errorCode = DailyAdminErrorCodes.InvalidDate;
            return false;
        }

        to = parsedTo ?? today;
        from = parsedFrom ?? to.AddDays(-(PeriodDays - 1));
        if (from > to || to.DayNumber - from.DayNumber + 1 > MaxPeriodDays)
        {
            errorCode = DailyAdminErrorCodes.InvalidPeriod;
            return false;
        }

        return true;
    }

    private static bool TryParse(string? raw, ref DateOnly? value)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return true;
        if (!DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
            return false;
        value = day;
        return true;
    }

    /// <summary>
    /// Plus trouvé = meilleur taux, plus raté = pire taux, parmi les morceaux qui ont au moins <paramref name="minAnswers"/> réponses. À taux égal, le
    /// plus répondu l'emporte (échantillon plus solide). Un seul morceau éligible : pas de « plus raté ».
    /// </summary>
    public static (Ranked? MostFound, Ranked? MostMissed) Rank(IEnumerable<Ranked> rows, int minAnswers)
    {
        ArgumentNullException.ThrowIfNull(rows);
        var eligible = rows.Where(r => r.Answers >= minAnswers).ToList();
        if (eligible.Count == 0)
            return (null, null);

        var mostFound = eligible.OrderByDescending(r => r.RatePercent).ThenByDescending(r => r.Answers).First();
        if (eligible.Count == 1)
            return (mostFound, null);

        var mostMissed = eligible.Where(r => !ReferenceEquals(r, mostFound)).OrderBy(r => r.RatePercent).ThenByDescending(r => r.Answers).First();
        return (mostFound, mostMissed);
    }

    /// <summary>Un morceau et ses réponses sur la période.</summary>
    public sealed record Ranked(int TrackId, int Answers, int FullyCorrect)
    {
        public double RatePercent => Answers == 0 ? 0 : Math.Round((double)FullyCorrect / Answers * 100, 1);
    }
}

public static class GetWeeklyRecapEndpoint
{
    public static ProblemDetails Validate([FromQuery] string? from, [FromQuery] string? to, IGameCalendar calendar) =>
        WeeklyRecapRules.TryResolvePeriod(from, to, calendar.Today, out _, out _, out var code)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(
                StatusCodes.Status400BadRequest, code!,
                code == DailyAdminErrorCodes.InvalidDate ? "Les dates doivent être au format aaaa-mm-jj." : "La période doit finir après son début, sur un an au plus.");

    /// <summary>
    /// <c>GET /api/admin/daily/weekly-recap?from=&amp;to=</c> : le morceau le plus trouvé et le plus raté de la période (les 7 derniers jours,
    /// aujourd'hui compris, par défaut), pour les stories hebdo de l'admin. Les joueurs supprimés n'y figurent pas. 200 même sans assez de données
    /// (<c>insufficient_data</c>). **Pas de pochette** : les stories sont des images publiées hors du site, or Deezer interdit de stocker ses images
    /// (piège 47) ; seuls l'artiste et le titre y figurent.
    /// </summary>
    [WolverineGet("/api/admin/daily/weekly-recap", OperationId = "getWeeklyRecap")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public static async Task<WeeklyRecapResponse> Get(
        [FromQuery] string? from, [FromQuery] string? to, IDailyStatsQueries stats, ITrackDirectory directory, IGameCalendar calendar, CancellationToken ct)
    {
        WeeklyRecapRules.TryResolvePeriod(from, to, calendar.Today, out var fromDate, out var toDate, out _);
        var tallies = await stats.GetTrackTalliesAsync(fromDate, toDate, ct);
        var (mostFound, mostMissed) = WeeklyRecapRules.Rank(
            tallies.Select(t => new WeeklyRecapRules.Ranked(t.TrackId, t.Answers, t.FullyCorrect)), WeeklyRecapRules.MinAnswers);

        var ids = new[] { mostFound?.TrackId, mostMissed?.TrackId }.OfType<int>().Distinct().ToList();
        var infos = ids.Count == 0 ? new Dictionary<int, TrackInfo>() : (await directory.GetAsync(ids, ct)).ToDictionary(p => p.Key, p => p.Value);

        WeeklyTrackResponse? ToResponse(WeeklyRecapRules.Ranked? row) =>
            row is null ? null : new WeeklyTrackResponse(infos[row.TrackId].Artist, infos[row.TrackId].DisplayTitle, row.RatePercent, row.Answers);

        return new WeeklyRecapResponse(
            mostFound is null ? WeeklyRecapStatus.InsufficientData : WeeklyRecapStatus.Ok,
            fromDate, toDate, WeeklyRecapRules.MinAnswers, ToResponse(mostFound), ToResponse(mostMissed));
    }
}
