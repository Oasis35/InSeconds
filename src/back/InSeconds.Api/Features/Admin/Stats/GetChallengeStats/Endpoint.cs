using InSeconds.Api.Common.Stats;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Stats.GetChallengeStats;

// « Stats par défi » de l'onglet Défis admin — scindé de GET /api/admin/stats (Dashboard) pour
// que sa partie lourde (30 défis + agrégats par morceau + histogrammes + joueurs) ne se charge
// qu'à l'ouverture de l'onglet Défis, pas à chaque ouverture de l'admin.
public static class GetChallengeStatsEndpoint
{
    public static IEndpointRouteBuilder MapGetChallengeStats(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/challenge-stats", async (
            HttpContext ctx,
            IDbContextFactory<ApplicationDbContext> dbFactory,
            SettingsService settingsService,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var allowedDurations = (await settingsService.GetAsync(ct)).AllowedDurationsSeconds;

            var challenges = await BuildChallengeStats(dbFactory, today, allowedDurations, ct);
            return Results.Ok(new ChallengeStatsResponse(challenges));
        })
        .WithName("GetChallengeStats")
        .WithTags("Admin")
        .Produces<ChallengeStatsResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }

    private static async Task<IReadOnlyList<ChallengeStatsDto>> BuildChallengeStats(
        IDbContextFactory<ApplicationDbContext> dbFactory, DateOnly today,
        IReadOnlyCollection<decimal> allowedDurations, CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var challenges = await db.DailyChallenges
            .AsNoTracking()
            .OrderByDescending(c => c.Date)
            .Take(30)
            .Select(c => new
            {
                c.Id,
                c.Date,
                // Une seule projection des sessions, réutilisée pour les scores/compteurs
                // (ci-dessous) ET la liste des joueurs par défi (ChallengePlayerDto) — évite
                // de répéter trois fois le même parcours de c.GameSessions.
                Sessions = c.GameSessions.Select(s => new { s.PlayerId, s.Status, s.TotalScore }).ToList(),
                Tracks         = c.Tracks
                    .OrderBy(t => t.Position)
                    .Select(t => new
                    {
                        t.Position,
                        t.Track.Artist,
                        t.Track.Title,
                        TotalAnswers  = t.Answers.Count,
                        ArtistCorrect = t.Answers.Count(a => a.ArtistCorrect),
                        TitleCorrect  = t.Answers.Count(a => a.TitleCorrect),
                        Extended      = t.Answers.Count(a => a.WasExtended),
                        NotFound      = t.Answers.Count(a => !a.ArtistCorrect && !a.TitleCorrect),
                        AvgListened   = t.Answers.Average(a => (double?)a.ListenedDurationSeconds)
                    })
                    .ToList()
            })
            .ToListAsync(ct);

        // Histogramme « en combien de temps les autres ont trouvé » par (défi, morceau) :
        // comptes des bonnes réponses groupés par palier d'écoute.
        var challengeIds = challenges.Select(c => c.Id).ToList();
        var distRows = await db.GameSessionAnswers
            .AsNoTracking()
            .Where(a => challengeIds.Contains(a.Track.DailyChallengeId) && (a.ArtistCorrect || a.TitleCorrect))
            .GroupBy(a => new { a.Track.DailyChallengeId, a.Track.Position, a.ListenedDurationSeconds })
            .Select(g => new { g.Key.DailyChallengeId, g.Key.Position, g.Key.ListenedDurationSeconds, Count = g.Count() })
            .ToListAsync(ct);
        var correctCountsByTrack = distRows
            .GroupBy(x => (x.DailyChallengeId, x.Position))
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyDictionary<decimal, int>)g.ToDictionary(x => x.ListenedDurationSeconds, x => x.Count));
        var emptyCounts = (IReadOnlyDictionary<decimal, int>)new Dictionary<decimal, int>();

        return challenges.Select(c =>
        {
            var scores = c.Sessions
                .Where(s => s.Status == Domain.SessionStatus.Completed)
                .Select(s => s.TotalScore)
                .ToList();
            var pendingRaw     = c.Sessions.Count(s => s.Status == Domain.SessionStatus.Pending);
            var abandonedCount = c.Sessions.Count(s => s.Status == Domain.SessionStatus.Abandoned);
            var expiredRaw     = c.Sessions.Count(s => s.Status == Domain.SessionStatus.Expired);
            // Défi passé : les Pending que l'expiry paresseuse n'a pas encore basculés
            // (joueur jamais revenu) comptent comme des « non terminés ». Défi du jour :
            // ils sont encore réellement en cours.
            var isPast         = c.Date < today;
            var pendingCount   = isPast ? 0 : pendingRaw;
            var expiredCount   = isPast ? expiredRaw + pendingRaw : expiredRaw;
            var players = c.Sessions
                .Select(s => new ChallengePlayerDto(s.PlayerId, s.Status.ToString(), s.TotalScore))
                .ToList();

            var sorted = scores.OrderBy(s => s).ToList();
            double? median = sorted.Count == 0 ? null
                : sorted.Count % 2 == 1
                    ? sorted[sorted.Count / 2]
                    : (sorted[sorted.Count / 2 - 1] + sorted[sorted.Count / 2]) / 2.0;

            var tracks = c.Tracks.Select(t => new TrackStatsDto(
                t.Position,
                t.Artist,
                TextNormalizationHelpers.CleanDisplayTitle(t.Title),
                t.TotalAnswers,
                t.TotalAnswers == 0 ? 0 : Math.Round((double)t.ArtistCorrect / t.TotalAnswers * 100, 1),
                t.TotalAnswers == 0 ? 0 : Math.Round((double)t.TitleCorrect  / t.TotalAnswers * 100, 1),
                t.TotalAnswers == 0 ? 0 : Math.Round((double)t.Extended      / t.TotalAnswers * 100, 1),
                t.AvgListened.HasValue ? Math.Round(t.AvgListened.Value, 2) : null,
                GuessTimeDistribution.Build(
                    allowedDurations,
                    correctCountsByTrack.GetValueOrDefault((c.Id, t.Position), emptyCounts)),
                t.NotFound
            )).ToList();

            return new ChallengeStatsDto(
                c.Id,
                c.Date,
                scores.Count,
                pendingCount,
                abandonedCount,
                expiredCount,
                scores.Count == 0 ? null : scores.Min(),
                scores.Count == 0 ? null : scores.Max(),
                scores.Count == 0 ? null : Math.Round(scores.Average(), 1),
                median,
                tracks,
                players);
        }).ToList();
    }
}
