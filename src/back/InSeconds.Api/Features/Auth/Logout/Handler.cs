using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Auth.Logout;

// Handler injecté directement (pas via le bus Wolverine, comme GetCurrentPlayer) :
// a besoin du HttpContext pour effacer le cookie, ce que le bus ne fournit pas
// directement aux handlers.
public sealed class LogoutHandler(ICookieAuthService cookieAuth)
{
    public IResult Handle(LogoutCommand command, HttpContext ctx)
    {
        cookieAuth.ClearCookie(ctx);
        return Results.Ok();
    }
}
