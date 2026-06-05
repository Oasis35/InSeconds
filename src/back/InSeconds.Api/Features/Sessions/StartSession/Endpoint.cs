using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Sessions.StartSession;

public static class StartSessionEndpoint
{
    public static IEndpointRouteBuilder MapStartSession(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/sessions", async (
            HttpContext httpContext,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            var playerId = httpContext.GetPlayerId();
            return await bus.InvokeAsync<IResult>(new StartSessionCommand(playerId), ct);
        })
        .WithName("StartSession")
        .WithTags("Sessions")
        .Produces<StartSessionResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status409Conflict)
        .Produces(StatusCodes.Status503ServiceUnavailable);

        return routes;
    }
}
