using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Common.Auth;

public sealed class CookieAuthService(
    ApplicationDbContext db,
    IDataProtector protector,
    IHostEnvironment env) : ICookieAuthService
{
    public const string CookieName = "authToken";
    private static readonly TimeSpan CookieLifetime = TimeSpan.FromDays(90);

    public async Task<Guid> ResolveOrCreatePlayerAsync(HttpContext httpContext, CancellationToken ct = default)
    {
        var player = await TryResolveExistingPlayerEntityAsync(httpContext, ct);

        if (player is null)
        {
            player = new Player
            {
                Id        = Guid.NewGuid(),
                IsGuest   = true,
                AuthToken = Guid.NewGuid(),
                CreatedAt = DateTime.UtcNow,
            };
            db.Players.Add(player);
        }
        else
        {
            player.LastSeenAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        IssueCookie(httpContext, player.AuthToken);

        return player.Id;
    }

    public async Task<Guid?> TryResolvePlayerAsync(HttpContext httpContext, CancellationToken ct = default)
    {
        var player = await TryResolveExistingPlayerEntityAsync(httpContext, ct);
        if (player is null)
            return null;

        player.LastSeenAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return player.Id;
    }

    private async Task<Player?> TryResolveExistingPlayerEntityAsync(HttpContext httpContext, CancellationToken ct)
    {
        if (!httpContext.Request.Cookies.TryGetValue(CookieName, out var rawValue))
            return null;

        try
        {
            var unprotected = protector.Unprotect(rawValue);
            if (!Guid.TryParse(unprotected, out var authToken))
                return null;

            return await db.Players
                .FirstOrDefaultAsync(p => p.AuthToken == authToken, ct);
        }
        catch
        {
            // Cookie falsifié ou clé Data Protection expirée
            return null;
        }
    }

    public void IssueCookie(HttpContext httpContext, Guid authToken)
    {
        var protectedValue = protector.Protect(authToken.ToString());

        httpContext.Response.Cookies.Append(CookieName, protectedValue, new CookieOptions
        {
            HttpOnly = true,
            SameSite = (env.IsDevelopment() || env.IsEnvironment("Testing")) ? SameSiteMode.Strict : SameSiteMode.Lax,
            Secure   = !(env.IsDevelopment() || env.IsEnvironment("Testing")),
            Expires  = DateTimeOffset.UtcNow.Add(CookieLifetime),
            MaxAge   = CookieLifetime,
        });
    }

    public void ClearCookie(HttpContext httpContext)
    {
        httpContext.Response.Cookies.Delete(CookieName, new CookieOptions
        {
            HttpOnly = true,
            SameSite = (env.IsDevelopment() || env.IsEnvironment("Testing")) ? SameSiteMode.Strict : SameSiteMode.Lax,
            Secure   = !(env.IsDevelopment() || env.IsEnvironment("Testing")),
        });
    }
}
