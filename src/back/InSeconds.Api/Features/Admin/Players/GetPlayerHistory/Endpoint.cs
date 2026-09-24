using InSeconds.Api.Common.Auth;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Players.GetPlayerHistory;

public static class GetPlayerHistoryEndpoint
{
    public const int HistoryDays = 30;

    public static IEndpointRouteBuilder MapGetPlayerHistory(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/players/{playerId:guid}/history", async (
            Guid playerId,
            HttpContext ctx,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            // Parties des 30 derniers jours (aujourd'hui inclus), plus récentes d'abord.
            // Chargé à la demande depuis l'onglet Joueurs (dépliage d'une ligne).
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var from = today.AddDays(-(HistoryDays - 1));

            var sessions = await db.GameSessions
                .AsNoTracking()
                .Where(s => s.PlayerId == playerId && s.DailyChallenge.Date >= from)
                .OrderByDescending(s => s.DailyChallenge.Date)
                .Select(s => new
                {
                    s.DailyChallenge.Date,
                    s.Status,
                    s.TotalScore,
                    s.FreezesUsed,
                    s.FreezeEarned,
                })
                .ToListAsync(ct);

            var games = sessions.Select(s =>
            {
                var status = s.Status == SessionStatus.Pending && s.Date < today
                    ? SessionStatus.Expired
                    : s.Status;
                return new PlayerHistoryEntryDto(
                    s.Date,
                    status.ToString(),
                    status == SessionStatus.Completed ? s.TotalScore : null,
                    s.FreezesUsed,
                    s.FreezeEarned);
            }).ToList();

            return Results.Ok(new PlayerHistoryResponse(games));
        })
        .WithName("GetPlayerHistory")
        .WithTags("Admin")
        .Produces<PlayerHistoryResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }
}
