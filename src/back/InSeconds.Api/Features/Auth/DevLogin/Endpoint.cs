using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Auth.DevLogin;

// Monté uniquement sous IsDevelopment() (cf. Program.cs) — jamais en Testing ni
// Production. Objectif : se connecter comme un compte de test sans copier un lien
// depuis les logs Docker à chaque fois, en local uniquement.
public static class DevLoginEndpoint
{
    public static IEndpointRouteBuilder MapDevLoginEndpoint(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/auth/dev-login", async (
            DevLoginBody body,
            HttpContext ctx,
            ICookieAuthService cookieAuth,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            var currentGuestPlayerId = await cookieAuth.ResolveOrCreatePlayerAsync(ctx, ct);

            var outcome = await bus.InvokeAsync<DevLoginOutcome>(
                new DevLoginCommand(body.Email, currentGuestPlayerId), ct);

            if (outcome.AuthTokenToIssue is { } authToken)
                cookieAuth.IssueCookie(ctx, authToken);

            return outcome.ApiResult;
        })
        .WithName("DevLogin")
        .WithTags("Auth")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status404NotFound);

        return routes;
    }
}

public sealed record DevLoginBody(string Email);
