using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Common.Auth;

public sealed class PlayerAuthMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext httpContext, ICookieAuthService cookieAuth)
    {
        if (!httpContext.Request.Path.StartsWithSegments("/api/admin") &&
            !httpContext.Request.Path.StartsWithSegments("/health"))
        {
            // Ne crée jamais de Player ici : un visiteur qui n'a jamais démarré de partie
            // (settings, autocomplete, stats/today...) ne doit pas polluer la table Players.
            // La création reste à la charge des endpoints qui en ont vraiment besoin
            // (StartSession, GetCurrentPlayer) via ICookieAuthService.ResolveOrCreatePlayerAsync.
            var playerId = await cookieAuth.TryResolvePlayerAsync(httpContext);
            if (playerId is not null)
                httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey] = playerId.Value;
        }

        await next(httpContext);
    }
}
