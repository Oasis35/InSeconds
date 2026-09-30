using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Auth.Logout;

// Handler injecté directement (pas via le bus Wolverine, comme GetCurrentPlayer) :
// a besoin du HttpContext pour effacer le cookie, ce que le bus ne fournit pas
// directement aux handlers.
public sealed class LogoutHandler(ICookieAuthService cookieAuth)
{
    public IResult Handle(LogoutCommand command, HttpContext ctx)
    {
        // Déconnecte uniquement CET appareil : on efface son cookie, sans toucher à
        // l'AuthToken du compte. En v1, tous les appareils d'un compte partagent le même
        // AuthToken : le faire tourner ici (fix M6 du 27/09, retiré le 30/09) déconnectait
        // tous les autres appareils du joueur (cf. piège 39 du CLAUDE.md racine).
        // La révocation par appareil arrive avec la v2 (table device_sessions).
        cookieAuth.ClearCookie(ctx);
        return Results.Ok();
    }
}
