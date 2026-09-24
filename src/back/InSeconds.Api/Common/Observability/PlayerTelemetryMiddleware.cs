using System.Diagnostics;
using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Common.Observability;

// Rattache chaque requête au joueur résolu par PlayerAuthMiddleware (à placer juste après lui) :
// tag sur la trace + scope de logs, pour filtrer toute la chronologie d'un joueur par son
// PlayerId, plus le pseudo des comptes connectés pour s'y retrouver sans passer par l'admin.
// Jamais d'email ni de cookie.
public sealed class PlayerTelemetryMiddleware(RequestDelegate next, ILogger<PlayerTelemetryMiddleware> logger)
{
    public const string PlayerIdTag = "inseconds.player_id";
    public const string PlayerPseudoTag = "inseconds.player_pseudo";

    public async Task InvokeAsync(HttpContext httpContext)
    {
        var playerId = httpContext.GetPlayerIdOrNull();
        if (playerId is null)
        {
            await next(httpContext);
            return;
        }

        Activity.Current?.SetTag(PlayerIdTag, playerId.Value.ToString());

        var scope = new Dictionary<string, object> { ["PlayerId"] = playerId.Value };
        if (httpContext.GetPlayerPseudoOrNull() is { } pseudo)
        {
            Activity.Current?.SetTag(PlayerPseudoTag, pseudo);
            scope["PlayerPseudo"] = pseudo;
        }

        using (logger.BeginScope(scope))
        {
            await next(httpContext);
        }
    }
}
