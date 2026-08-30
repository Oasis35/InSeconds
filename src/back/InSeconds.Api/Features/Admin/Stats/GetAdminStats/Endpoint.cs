using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Stats.GetAdminStats;

public static class GetAdminStatsEndpoint
{
    public static IEndpointRouteBuilder MapGetAdminStats(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/stats", async (
            HttpContext ctx,
            IDbContextFactory<ApplicationDbContext> dbFactory,
            [FromQuery] string? date,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var selectedDate = date is not null && DateOnly.TryParse(date, out var parsed) ? parsed : today;

            // Queries parallèles : chaque Build* crée son propre DbContext via la factory
            // (un contexte ne supporte pas les opérations concurrentes).
            var dailyActivityTask   = BuildDailyActivity(dbFactory, ct);
            var playerBreakdownTask = BuildPlayerBreakdown(dbFactory, ct);
            var availableDatesTask  = BuildAvailableDates(dbFactory, ct);
            var selectedDayKpisTask = BuildDailyKpis(dbFactory, selectedDate, today, ct);

            await Task.WhenAll(dailyActivityTask, playerBreakdownTask, availableDatesTask, selectedDayKpisTask);

            return Results.Ok(new AdminStatsResponse(
                dailyActivityTask.Result,
                playerBreakdownTask.Result,
                availableDatesTask.Result,
                selectedDayKpisTask.Result));
        })
        .WithName("GetAdminStats")
        .WithTags("Admin")
        .Produces<AdminStatsResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }

    private static async Task<IReadOnlyList<DailyActivityDto>> BuildDailyActivity(
        IDbContextFactory<ApplicationDbContext> dbFactory, CancellationToken ct)
    {
        var since = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-29));
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        await using var db = await dbFactory.CreateDbContextAsync(ct);

        var raw = await db.GameSessions
            .AsNoTracking()
            .Where(s => s.DailyChallenge.Date >= since && s.Status == Domain.SessionStatus.Completed)
            .GroupBy(s => s.DailyChallenge.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var byDate = raw.ToDictionary(x => x.Date, x => x.Count);

        // Génère les 30 jours glissants, jours sans activité = 0
        return Enumerable.Range(0, 30)
            .Select(i => since.AddDays(i))
            .Where(d => d <= today)
            .Select(d => new DailyActivityDto(d, byDate.GetValueOrDefault(d, 0)))
            .ToList();
    }

    private static async Task<IReadOnlyList<DateOnly>> BuildAvailableDates(
        IDbContextFactory<ApplicationDbContext> dbFactory, CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        return await db.DailyChallenges
            .AsNoTracking()
            .OrderByDescending(c => c.Date)
            .Select(c => c.Date)
            .ToListAsync(ct);
    }

    private static async Task<DailyKpisDto?> BuildDailyKpis(
        IDbContextFactory<ApplicationDbContext> dbFactory, DateOnly date, DateOnly today, CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var exists = await db.DailyChallenges
            .AsNoTracking()
            .AnyAsync(c => c.Date == date, ct);

        if (!exists) return null;

        var sessions = await db.GameSessions
            .AsNoTracking()
            .Where(s => s.DailyChallenge.Date == date)
            .Select(s => new { s.Status, s.TotalScore })
            .ToListAsync(ct);

        var completed  = sessions.Count(s => s.Status == Domain.SessionStatus.Completed);
        var abandoned  = sessions.Count(s => s.Status == Domain.SessionStatus.Abandoned);
        var expiredRaw = sessions.Count(s => s.Status == Domain.SessionStatus.Expired);
        var pending    = sessions.Count(s => s.Status == Domain.SessionStatus.Pending);

        // Jour passé : les Pending que l'expiry paresseuse n'a pas encore basculés
        // comptent comme « non terminés » (Expired), pas comme des abandons explicites.
        var isPast           = date < today;
        var effectiveExpired = isPast ? expiredRaw + pending : expiredRaw;
        var effectivePending = isPast ? 0 : pending;
        var total = completed + abandoned + expiredRaw + pending;
        var completionRate = total == 0 ? 0.0 : Math.Round((double)completed / total * 100, 1);

        var scores = sessions
            .Where(s => s.Status == Domain.SessionStatus.Completed)
            .Select(s => s.TotalScore)
            .OrderBy(s => s)
            .ToList();

        double? median = scores.Count == 0 ? null
            : scores.Count % 2 == 1
                ? scores[scores.Count / 2]
                : (scores[scores.Count / 2 - 1] + scores[scores.Count / 2]) / 2.0;

        return new DailyKpisDto(date, completed, abandoned, effectiveExpired, effectivePending, total, completionRate, median);
    }

    private static async Task<PlayerBreakdownDto> BuildPlayerBreakdown(
        IDbContextFactory<ApplicationDbContext> dbFactory, CancellationToken ct)
    {
        var cutoff7  = DateTime.UtcNow.AddDays(-7);
        var cutoff30 = DateTime.UtcNow.AddDays(-30);

        await using var db = await dbFactory.CreateDbContextAsync(ct);

        var counts = await db.Players
            .AsNoTracking()
            .Where(p => !p.IsDeleted)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Guests     = g.Count(p => p.IsGuest),
                Registered = g.Count(p => !p.IsGuest),
                Active7    = g.Count(p => p.LastSeenAt >= cutoff7),
                Active30   = g.Count(p => p.LastSeenAt >= cutoff30),
            })
            .FirstOrDefaultAsync(ct);

        return new PlayerBreakdownDto(counts?.Guests ?? 0, counts?.Registered ?? 0, counts?.Active7 ?? 0, counts?.Active30 ?? 0);
    }
}
