using System.Globalization;
using System.Security.Claims;
using InSeconds.Api.Modules.Players.Contracts;

namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>
/// Contenu du ticket du cookie : le joueur et son appareil, rien d'autre (§ 5.5 du plan v2). Le rôle
/// admin n'y est ni écrit ni lu : la validation le relit en base à chaque requête et ne l'ajoute
/// qu'au joueur de la requête.
/// </summary>
public static class PlayerClaims
{
    public const string PlayerId = "player_id";
    public const string DeviceSessionId = "device_session_id";

    public static ClaimsPrincipal Create(Guid playerId, int deviceSessionId, bool isAdmin)
    {
        var claims = new List<Claim>
        {
            new(PlayerId, playerId.ToString()),
            new(DeviceSessionId, deviceSessionId.ToString(CultureInfo.InvariantCulture)),
        };
        if (isAdmin)
            claims.Add(new Claim(ClaimTypes.Role, Roles.Admin));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, AuthSetup.Scheme));
    }

    public static bool TryRead(ClaimsPrincipal? principal, out Guid playerId, out int deviceSessionId)
    {
        deviceSessionId = 0;
        return Guid.TryParse(principal?.FindFirstValue(PlayerId), out playerId)
            && int.TryParse(principal?.FindFirstValue(DeviceSessionId), NumberStyles.None, CultureInfo.InvariantCulture, out deviceSessionId);
    }
}

/// <summary>Le joueur de la requête, d'après le cookie validé (ou la transition d'un cookie v1).</summary>
public sealed class ClaimsCurrentPlayer(IHttpContextAccessor accessor) : ICurrentPlayer
{
    private ClaimsPrincipal? User =>
        accessor.HttpContext?.User is { Identity.IsAuthenticated: true } user ? user : null;

    public Guid? PlayerId => Guid.TryParse(User?.FindFirstValue(PlayerClaims.PlayerId), out var id) ? id : null;

    public int? DeviceSessionId =>
        int.TryParse(User?.FindFirstValue(PlayerClaims.DeviceSessionId), NumberStyles.None, CultureInfo.InvariantCulture, out var id)
            ? id
            : null;

    public bool IsAdmin => User?.IsInRole(Roles.Admin) == true;
}
