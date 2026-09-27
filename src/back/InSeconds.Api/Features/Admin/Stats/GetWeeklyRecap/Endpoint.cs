using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Stats.GetWeeklyRecap;

// Récap de la semaine pour les stories Instagram (onglet Actions admin) : morceau le plus
// trouvé / le plus raté sur les défis des 7 derniers jours (aujourd'hui inclus). Toujours 200 : « pas assez de données » est un statut, pas une erreur.
public static class GetWeeklyRecapEndpoint
{
    public const int PeriodDays = 7;
    public const int MinAnswers = 3;

    public static IEndpointRouteBuilder MapGetWeeklyRecap(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/weekly-recap", async (
            HttpContext ctx,
            ApplicationDbContext db,
            SettingsService settingsService,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            var to = DateOnly.FromDateTime(DateTime.UtcNow);
            var from = to.AddDays(-(PeriodDays - 1));
            var appSettings = await settingsService.GetAsync(ct);

            // Groupé par Track (et non par DailyChallengeTrack) : un morceau réapparu dans la
            // fenêtre cumule ses réponses.
            var trackRows = await db.GameSessionAnswers
                .AsNoTracking()
                .Where(a => a.Track.DailyChallenge.Date >= from && a.Track.DailyChallenge.Date <= to)
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
                from,
                to,
                MinAnswers,
                ToDto(mostFound, appSettings),
                ToDto(mostMissed, appSettings)));
        })
        .WithName("GetWeeklyRecap")
        .WithTags("Admin")
        .Produces<WeeklyRecapResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
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
