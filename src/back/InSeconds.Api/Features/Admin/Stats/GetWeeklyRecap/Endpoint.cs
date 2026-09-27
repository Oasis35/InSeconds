using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using System.Globalization;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Stats.GetWeeklyRecap;

// Récap de la semaine pour les stories Instagram (onglet Actions admin) : morceau le plus
// trouvé / le plus raté sur les défis d'une période (par défaut les 7 derniers jours, aujourd'hui
// inclus ; ?from=&to= au format yyyy-MM-dd pour la choisir). 200 même sans assez de données :
// « pas assez de données » est un statut, pas une erreur.
public static class GetWeeklyRecapEndpoint
{
    public const int PeriodDays = 7;
    public const int MinAnswers = 3;
    public const int MaxPeriodDays = 366;

    public static IEndpointRouteBuilder MapGetWeeklyRecap(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/weekly-recap", async (
            HttpContext ctx,
            [FromQuery] string? from,
            [FromQuery] string? to,
            ApplicationDbContext db,
            SettingsService settingsService,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            if (!TryResolvePeriod(from, to, DateOnly.FromDateTime(DateTime.UtcNow), out var fromDate, out var toDate, out var error))
                return Results.BadRequest(new { error });
            var appSettings = await settingsService.GetAsync(ct);

            // Groupé par Track (et non par DailyChallengeTrack) : un morceau réapparu dans la
            // fenêtre cumule ses réponses.
            var trackRows = await db.GameSessionAnswers
                .AsNoTracking()
                .Where(a => a.Track.DailyChallenge.Date >= fromDate && a.Track.DailyChallenge.Date <= toDate)
                .GroupBy(a => new { a.Track.TrackId, a.Track.Track.Artist, a.Track.Track.Title, a.Track.Track.CoverHash })
                .Select(g => new WeeklyTrackRow(
                    g.Key.Artist,
                    g.Key.Title,
                    g.Key.CoverHash,
                    g.Count(),
                    g.Count(a => a.ArtistCorrect && a.TitleCorrect)))
                .ToListAsync(ct);

            var (mostFound, mostMissed) = Rank(trackRows, MinAnswers);

            return Results.Ok(new WeeklyRecapResponse(
                mostFound is null ? WeeklyRecapStatus.InsufficientData : WeeklyRecapStatus.Ok,
                fromDate,
                toDate,
                MinAnswers,
                ToDto(mostFound, appSettings),
                ToDto(mostMissed, appSettings)));
        })
        .WithName("GetWeeklyRecap")
        .WithTags("Admin")
        .Produces<WeeklyRecapResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }

    /// <summary>
    /// Période demandée : bornes absentes → <c>to</c> = aujourd'hui, <c>from</c> = <c>to</c> − 6 jours.
    /// Erreurs : <c>invalid_date</c> (format ≠ yyyy-MM-dd), <c>invalid_period</c> (from &gt; to ou plus
    /// de <see cref="MaxPeriodDays"/> jours).
    /// </summary>
    public static bool TryResolvePeriod(string? fromRaw, string? toRaw, DateOnly today,
        out DateOnly from, out DateOnly to, out string? error)
    {
        from = to = default;
        error = null;
        DateOnly? parsedFrom = null, parsedTo = null;
        if (!TryParse(fromRaw, ref parsedFrom) || !TryParse(toRaw, ref parsedTo))
        {
            error = "invalid_date";
            return false;
        }

        to = parsedTo ?? today;
        from = parsedFrom ?? to.AddDays(-(PeriodDays - 1));
        if (from > to || to.DayNumber - from.DayNumber + 1 > MaxPeriodDays)
        {
            error = "invalid_period";
            return false;
        }
        return true;
    }

    private static bool TryParse(string? raw, ref DateOnly? value)
    {
        if (string.IsNullOrWhiteSpace(raw)) return true;
        if (!DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            return false;
        value = d;
        return true;
    }

    public sealed record WeeklyTrackRow(string Artist, string Title, string? CoverHash, int Answers, int FullyCorrect)
    {
        public double RatePercent => Rate(FullyCorrect, Answers);
    }

    /// <summary>
    /// Plus trouvé = meilleur taux, plus raté = pire taux, parmi les morceaux ayant au moins
    /// <paramref name="minAnswers"/> réponses. À taux égal, le plus répondu l'emporte (échantillon
    /// plus solide). Un seul morceau éligible → pas de « plus raté » (ce serait le même).
    /// </summary>
    public static (WeeklyTrackRow? MostFound, WeeklyTrackRow? MostMissed) Rank(
        IEnumerable<WeeklyTrackRow> rows, int minAnswers)
    {
        var eligible = rows.Where(r => r.Answers >= minAnswers).ToList();
        if (eligible.Count == 0) return (null, null);

        var mostFound = eligible
            .OrderByDescending(r => r.RatePercent)
            .ThenByDescending(r => r.Answers)
            .First();
        if (eligible.Count == 1) return (mostFound, null);

        var mostMissed = eligible
            .Where(r => !ReferenceEquals(r, mostFound))
            .OrderBy(r => r.RatePercent)
            .ThenByDescending(r => r.Answers)
            .First();
        return (mostFound, mostMissed);
    }

    private static double Rate(int part, int total) =>
        total == 0 ? 0 : Math.Round((double)part / total * 100, 1);

    private static WeeklyTrackDto? ToDto(WeeklyTrackRow? row, AppSettings settings) =>
        row is null ? null : new WeeklyTrackDto(
            row.Artist,
            TextNormalizationHelpers.CleanDisplayTitle(row.Title),
            row.CoverHash is not null ? settings.BuildCoverUrl(row.CoverHash) : null,
            row.RatePercent,
            row.Answers);
}
