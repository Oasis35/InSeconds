using System.Diagnostics;
using InSeconds.Api.Modules.Players.Contracts;

namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>
/// Rattache chaque requête au joueur identifié (<see cref="ICurrentPlayer"/>) : tag sur la trace et scope
/// de journalisation, pour retrouver toute la chronologie d'un joueur par son identifiant (§ 5.7 du plan v2,
/// repris du <c>PlayerTelemetryMiddleware</c> de la v1). Placé après l'authentification et la transition
/// des cookies v1, avant les endpoints. Jamais d'email, de pseudo, de cookie ni d'<c>Authorization</c> :
/// l'identifiant technique suffit. Sans joueur identifié, rien n'est ajouté.
/// </summary>
internal sealed class PlayerTelemetryMiddleware(RequestDelegate next, ILogger<PlayerTelemetryMiddleware> logger)
{
    public const string PlayerIdTag = "inseconds.player_id";
    public const string PlayerIdScopeKey = "PlayerId";

    public async Task InvokeAsync(HttpContext context, ICurrentPlayer current)
    {
        if (current.PlayerId is not { } playerId)
        {
            await next(context);
            return;
        }

        Activity.Current?.SetTag(PlayerIdTag, playerId.ToString());

        using (logger.BeginScope(new Dictionary<string, object> { [PlayerIdScopeKey] = playerId }))
        {
            await next(context);
        }
    }
}
