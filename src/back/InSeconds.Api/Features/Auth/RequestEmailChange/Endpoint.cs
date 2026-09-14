using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Auth.RequestEmailChange;

public static class RequestEmailChangeEndpoint
{
    public const string RateLimiterPolicy = "email-change-request";

    // enableRateLimiting=false en Testing, même raison que RequestMagicLink (plusieurs
    // tests d'intégration appellent cette route à travers le même HttpClient partagé) —
    // jamais désactivé en Dev/Production.
    public static IEndpointRouteBuilder MapRequestEmailChange(this IEndpointRouteBuilder routes, bool enableRateLimiting = true)
    {
        var route = routes.MapPut("/api/players/me/email", async (
            RequestEmailChangeBody body,
            HttpContext httpContext,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            // Pas de Player résolu = visiteur guest anonyme : rien à changer.
            var playerId = httpContext.GetPlayerIdOrNull();
            if (playerId is null)
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var command = new RequestEmailChangeCommand(playerId.Value, body.NewEmail);
            return await bus.InvokeAsync<IResult>(command, ct);
        })
        .WithName("RequestEmailChange")
        .WithTags("Players")
        .Produces<RequestEmailChangeResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict)
        .Produces(StatusCodes.Status429TooManyRequests);

        if (enableRateLimiting)
            route.RequireRateLimiting(RateLimiterPolicy);

        return routes;
    }
}

public sealed record RequestEmailChangeBody(string NewEmail);
