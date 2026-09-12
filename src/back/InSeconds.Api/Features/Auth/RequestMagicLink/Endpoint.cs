using Wolverine;

namespace InSeconds.Api.Features.Auth.RequestMagicLink;

public static class RequestMagicLinkEndpoint
{
    public const string RateLimiterPolicy = "magic-link-request";

    // enableRateLimiting=false en Testing (plusieurs tests d'intégration appellent cette
    // route à travers le même HttpClient/collection — cf. Program.cs) — jamais désactivé
    // en Dev/Production. Le throttle de 60s par email (RequestMagicLinkHandler) ne bloque
    // pas un attaquant qui vise des emails différents ou martèle un même destinataire une
    // fois par minute indéfiniment ("email bombing") ; ce rate limit par IP complète cette
    // protection.
    public static IEndpointRouteBuilder MapRequestMagicLink(this IEndpointRouteBuilder routes, bool enableRateLimiting = true)
    {
        var route = routes.MapPost("/api/auth/magic-link/request", async (
            RequestMagicLinkBody body,
            IMessageBus bus,
            CancellationToken ct) =>
            await bus.InvokeAsync<IResult>(new RequestMagicLinkCommand(body.Email), ct))
        .WithName("RequestMagicLink")
        .WithTags("Auth")
        .Produces<RequestMagicLinkResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status429TooManyRequests);

        if (enableRateLimiting)
            route.RequireRateLimiting(RateLimiterPolicy);

        return routes;
    }
}

public sealed record RequestMagicLinkBody(string Email);
