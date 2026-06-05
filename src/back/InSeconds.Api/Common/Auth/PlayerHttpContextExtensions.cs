namespace InSeconds.Api.Common.Auth;

public static class PlayerHttpContextExtensions
{
    public const string PlayerIdKey = "PlayerId";

    public static Guid GetPlayerId(this HttpContext httpContext)
    {
        if (httpContext.Items.TryGetValue(PlayerIdKey, out var value) && value is Guid id)
            return id;

        throw new InvalidOperationException("PlayerId not found in HttpContext. Ensure PlayerAuthMiddleware is registered.");
    }
}
