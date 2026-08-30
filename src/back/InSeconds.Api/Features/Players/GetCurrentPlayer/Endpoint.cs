using InSeconds.Api.Common.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Players.GetCurrentPlayer;

public static class GetCurrentPlayerEndpoint
{
    public static IEndpointRouteBuilder MapGetCurrentPlayer(this IEndpointRouteBuilder app)
    {
        // Usage : BrowserIdComponent (admin) ET PlayerSessionService (front joueur,
        // pour savoir si la session courante est liée ou guest) — on garde la
        // création à la demande (ResolveOrCreatePlayerAsync) pour que l'admin ait
        // toujours un ID navigateur affiché, même s'il ne joue jamais.
        app.MapGet("/api/players/me", async (HttpContext ctx, ICookieAuthService cookieAuth, ApplicationDbContext db, CancellationToken ct) =>
        {
            var playerId = await cookieAuth.ResolveOrCreatePlayerAsync(ctx, ct);

            var player = await db.Players
                .AsNoTracking()
                .Where(p => p.Id == playerId)
                .Select(p => new GetCurrentPlayerResponse(p.Id, p.IsGuest, p.Email, p.Pseudo))
                .FirstAsync(ct);

            return Results.Ok(player);
        });

        return app;
    }
}

public sealed record GetCurrentPlayerResponse(Guid PlayerId, bool IsGuest, string? Email, string? Pseudo);
