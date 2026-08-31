using InSeconds.Api.Common.Auth;
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
    public static IEndpointRouteBuilder MapGetCurrentPlayer(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/players/me", async (HttpContext ctx, ICookieAuthService cookieAuth, ApplicationDbContext db, bool peek = false, CancellationToken ct = default) =>
        {
            Guid? playerId = peek
                ? await cookieAuth.TryResolvePlayerAsync(ctx, ct)
                : await cookieAuth.ResolveOrCreatePlayerAsync(ctx, ct);

            if (playerId is null)
                return Results.Ok(new GetCurrentPlayerResponse(Guid.Empty, true, null, null));

            var player = await db.Players
                .AsNoTracking()
                .Where(p => p.Id == playerId)
                .Select(p => new GetCurrentPlayerResponse(p.Id, p.IsGuest, p.Email, p.Pseudo))
                .FirstAsync(ct);

            return Results.Ok(player);
        })
        .WithName("GetCurrentPlayer")
        .WithTags("Players")
        .Produces<GetCurrentPlayerResponse>(StatusCodes.Status200OK);

        return app;
    }
}

public sealed record GetCurrentPlayerResponse(Guid PlayerId, bool IsGuest, string? Email, string? Pseudo);
