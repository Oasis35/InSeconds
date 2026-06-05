using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Common.Auth;

public sealed class PlayerAuthMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext httpContext, ICookieAuthService cookieAuth)
    {
        if (!httpContext.Request.Path.StartsWithSegments("/api/admin") &&
            !httpContext.Request.Path.StartsWithSegments("/health"))
        {
            var playerId = await cookieAuth.ResolveOrCreatePlayerAsync(httpContext);
            httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey] = playerId;
        }

        await next(httpContext);
    }
}
