using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.RateLimiting;
using InSeconds.Api.Common.Streak;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Players.GetCurrentPlayer;

public static class GetCurrentPlayerEndpoint
{
    // Usage : BrowserIdComponent (admin, appelle sans `peek` — création à la demande pour
    // toujours afficher un ID navigateur, même si l'admin ne joue jamais) ET
    // PlayerSessionService (front joueur, `peek=true` sur CHAQUE chargement de page — ne doit
    // jamais créer de Player/cookie pour un simple visiteur, sous peine de casser l'invariant
    // "un chargement de page ne pose aucun cookie" testé par happy-path.spec.ts, cf. création
    // paresseuse du Player). En mode peek, un visiteur sans cookie valide reste un guest anonyme
    // (PlayerId=Guid.Empty) sans aucune écriture en base.
    // enableRateLimiting=false en Testing (appelé à chaque chargement de page par la quasi-
    // totalité des tests d'intégration/E2E) — jamais désactivé en Dev/Production, cf.
    // RateLimiterPolicies.PlayerCreation (partagée avec StartSession, même ressource protégée).
    public static IEndpointRouteBuilder MapGetCurrentPlayer(this IEndpointRouteBuilder app, bool enableRateLimiting = true)
    {
        var route = app.MapGet("/api/players/me", async (HttpContext ctx, ICookieAuthService cookieAuth, ApplicationDbContext db, bool peek = false, CancellationToken ct = default) =>
        {
            Guid? playerId;
            if (peek)
            {
                var resolution = await cookieAuth.TryResolvePlayerAsync(ctx, ct);
                playerId = resolution?.PlayerId;
            }
            else
            {
                playerId = await cookieAuth.ResolveOrCreatePlayerAsync(ctx, ct);
            }

            if (playerId is null)
                return Results.Ok(new GetCurrentPlayerResponse(Guid.Empty, true, null, null, 0, 0, false, StreakDto.None));

            var player = await db.Players
                .AsNoTracking()
                .Where(p => p.Id == playerId)
                .Select(p => new
                {
                    p.Id,
                    p.IsGuest,
                    p.Email,
                    p.Pseudo,
                    p.CurrentStreak,
                    p.LastPlayedDate,
                    p.StreakFreezes,
                    GamesPlayed = p.GameSessions.Count(s => s.Status == SessionStatus.Completed),
                    p.IsAdmin,
                })
                .FirstAsync(ct);

            var rules = await StreakRulesReader.LoadAsync(db, ct);
            var streak = StreakDto.From(Player.ComputeStreakView(
                player.IsGuest, player.CurrentStreak, player.LastPlayedDate, player.StreakFreezes,
                DateOnly.FromDateTime(DateTime.UtcNow), rules));

            return Results.Ok(new GetCurrentPlayerResponse(
                player.Id,
                player.IsGuest,
                player.Email,
                player.Pseudo,
                streak.Streak,
                player.GamesPlayed,
                player.IsAdmin,
                streak));
        })
        .WithName("GetCurrentPlayer")
        .WithTags("Players")
        .Produces<GetCurrentPlayerResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status429TooManyRequests);

        if (enableRateLimiting)
            route.RequireRateLimiting(RateLimiterPolicies.PlayerCreation);

        return app;
    }
}

// CurrentStreak = série effective (0 si perdue) ; Streak = détail série + gels (rangée « Gels » du profil).
public sealed record GetCurrentPlayerResponse(Guid PlayerId, bool IsGuest, string? Email, string? Pseudo, int CurrentStreak, int GamesPlayed, bool IsAdmin, StreakDto Streak);
