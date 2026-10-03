using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using InSeconds.Api.Modules.Players.Persistence;

namespace InSeconds.Api.Modules.Players;

/// <summary>
/// Module Players (§ 3.1 du plan v2) : identité, compte, appareils, rôle admin. Ses endpoints
/// Wolverine.Http (<c>Application/</c>) sont découverts par Wolverine ; ses tables vivent dans le
/// schéma <c>players</c>.
/// </summary>
public static class PlayersModule
{
    public static IServiceCollection AddPlayers(this IServiceCollection services)
    {
        services.AddScoped<IPlayerStore, EfPlayerStore>();
        services.AddScoped<IPlayerQueries, EfPlayerQueries>();
        services.AddScoped<IPlayerSessions, EfPlayerSessions>();
        return services;
    }
}
