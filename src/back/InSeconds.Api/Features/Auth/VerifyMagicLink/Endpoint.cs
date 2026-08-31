using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Auth.VerifyMagicLink;

public static class VerifyMagicLinkEndpoint
{
    public static IEndpointRouteBuilder MapVerifyMagicLink(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/auth/magic-link/verify", async (
            VerifyMagicLinkBody body,
            HttpContext ctx,
            ICookieAuthService cookieAuth,
            IConfiguration configuration,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            // Point critique anti-CSRF : cet endpoint pose un cookie sur la base d'un
            // POST — cf. plan, section OriginValidator.
            var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
            if (!OriginValidator.IsTrustedOrigin(ctx, allowedOrigins))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            // Se connecter est une action délibérée qui justifie une ligne en base,
            // au même titre que démarrer une partie (cf. PlayerAuthMiddleware — plus
            // de création paresseuse implicite depuis #99).
            var currentGuestPlayerId = await cookieAuth.ResolveOrCreatePlayerAsync(ctx, ct);

            var outcome = await bus.InvokeAsync<VerifyMagicLinkOutcome>(
                new VerifyMagicLinkCommand(body.Token, body.Pseudo, currentGuestPlayerId), ct);

            if (outcome.AuthTokenToIssue is { } authToken)
                cookieAuth.IssueCookie(ctx, authToken);

            return outcome.ApiResult;
        })
        .WithName("VerifyMagicLink")
        .WithTags("Auth")
        .Produces<VerifyMagicLinkResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status409Conflict);

        return routes;
    }
}

public sealed record VerifyMagicLinkBody(string Token, string? Pseudo);
