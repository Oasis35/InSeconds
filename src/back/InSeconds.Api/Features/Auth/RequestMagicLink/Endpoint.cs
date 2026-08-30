using Wolverine;

namespace InSeconds.Api.Features.Auth.RequestMagicLink;

public static class RequestMagicLinkEndpoint
{
    public static IEndpointRouteBuilder MapRequestMagicLink(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/auth/magic-link/request", async (
            RequestMagicLinkBody body,
            IMessageBus bus,
            CancellationToken ct) =>
            await bus.InvokeAsync<IResult>(new RequestMagicLinkCommand(body.Email), ct))
        .WithName("RequestMagicLink")
        .WithTags("Auth")
        .Produces<RequestMagicLinkResponse>(StatusCodes.Status200OK);

        return routes;
    }
}

public sealed record RequestMagicLinkBody(string Email);
