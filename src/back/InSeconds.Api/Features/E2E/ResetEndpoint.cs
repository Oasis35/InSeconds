using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.E2E;

public static class E2EResetEndpoint
{
    public static IEndpointRouteBuilder MapE2EReset(this IEndpointRouteBuilder routes)
    {
        routes.MapDelete("/api/e2e/reset", async (
            HttpContext ctx,
            ApplicationDbContext db,
            bool deleteChallenge = false,
            CancellationToken ct = default) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            await db.GameSessionAnswers.ExecuteDeleteAsync(ct);
            await db.GameSessions.ExecuteDeleteAsync(ct);

            var devPlayerId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
            await db.Players
                .Where(p => p.Id != devPlayerId)
                .ExecuteDeleteAsync(ct);

            if (deleteChallenge)
            {
                var today = DateOnly.FromDateTime(DateTime.UtcNow);
                await db.DailyChallenges
                    .Where(c => c.Date == today)
                    .ExecuteDeleteAsync(ct);
            }

            return Results.Ok(new { reset = true, challengeDeleted = deleteChallenge });
        })
        .WithName("E2EReset")
        .WithTags("E2E");

        return routes;
    }
}
