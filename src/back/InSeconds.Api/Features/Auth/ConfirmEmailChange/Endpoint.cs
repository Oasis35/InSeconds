using Wolverine;

namespace InSeconds.Api.Features.Auth.ConfirmEmailChange;

public static class ConfirmEmailChangeEndpoint
{
    // Pas d'OriginValidator ici (contrairement à VerifyMagicLink) : cet endpoint ne pose
    // aucun cookie, son autorisation repose entièrement sur la possession du token
    // (secret, à usage unique, expirant à 15 min) envoyé par email — le risque CSRF
    // qu'OriginValidator mitige (poser un cookie au nom de la victime) ne s'applique pas.
    public static IEndpointRouteBuilder MapConfirmEmailChange(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/auth/email-change/confirm", async (
            ConfirmEmailChangeBody body,
            IMessageBus bus,
            CancellationToken ct) =>
            await bus.InvokeAsync<IResult>(new ConfirmEmailChangeCommand(body.Token), ct))
        .WithName("ConfirmEmailChange")
        .WithTags("Auth")
        .Produces<ConfirmEmailChangeResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status409Conflict);

        return routes;
    }
}

public sealed record ConfirmEmailChangeBody(string Token);
