namespace InSeconds.Api.Common.Auth;

public interface ICookieAuthService
{
    Task<Guid> ResolveOrCreatePlayerAsync(HttpContext httpContext, CancellationToken ct = default);
}
