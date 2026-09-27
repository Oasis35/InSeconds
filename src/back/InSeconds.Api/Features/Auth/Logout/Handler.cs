using InSeconds.Api.Common.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Auth.Logout;

// Handler injecté directement (pas via le bus Wolverine, comme GetCurrentPlayer) :
// a besoin du HttpContext pour effacer le cookie, ce que le bus ne fournit pas
// directement aux handlers.
public sealed class LogoutHandler(ICookieAuthService cookieAuth, ApplicationDbContext db)
{
    public async Task<IResult> Handle(LogoutCommand command, HttpContext ctx)
    {
        // Révoque le cookie côté serveur (M6, revue du 25/09) : sans ça, effacer le cookie
        // côté navigateur ne suffit pas — un cookie déjà copié ailleurs (ou volé) restait
        // valide jusqu'à ses 90 jours. Fait tourner l'AuthToken du compte, orphelinant tout
        // cookie en circulation ; aucun nouveau cookie n'est réémis ici (l'ancien token
        // pivoté n'est jamais renvoyé au client).
        var playerId = ctx.GetPlayerIdOrNull();
        if (playerId is { } id)
        {
            var player = await db.Players.FirstOrDefaultAsync(p => p.Id == id);
            if (player is not null)
            {
                player.RotateAuthToken(Guid.NewGuid());
                await db.SaveChangesAsync();
            }
        }

        cookieAuth.ClearCookie(ctx);
        return Results.Ok();
    }
}
