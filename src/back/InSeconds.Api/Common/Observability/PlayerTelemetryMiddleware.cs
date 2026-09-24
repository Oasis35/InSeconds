using System.Diagnostics;
using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Common.Observability;

// Rattache chaque requête au joueur résolu par PlayerAuthMiddleware (à placer juste après lui) :
// tag sur la trace + scope de logs, pour filtrer toute la chronologie d'un joueur par son
// PlayerId. Jamais d'email, de pseudo ni de cookie : l'identifiant technique suffit.
public sealed class PlayerTelemetryMiddleware(RequestDelegate next, ILogger<PlayerTelemetryMiddleware> logger)
{
    public const string PlayerIdTag = "inseconds.player_id";

    public async Task InvokeAsync(HttpContext httpContext)
    {
        var playerId = httpContext.GetPlayerIdOrNull();
        if (playerId is null)
        {
            await next(httpContext);
            return;
        }

        Activity.Current?.SetTag(PlayerIdTag, playerId.Value.ToString());

        using (logger.BeginScope(new Dictionary<string, object> { ["PlayerId"] = playerId.Value }))
        {
            await next(httpContext);
        }
    }
}
