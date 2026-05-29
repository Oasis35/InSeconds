using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public static class SubmitAnswerEndpoint
{
    public static IEndpointRouteBuilder MapSubmitAnswer(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/sessions/{sessionId:int}/answers", async (
            int sessionId,
            SubmitAnswerBody body,
            HttpContext httpContext,
            ICookieAuthService cookieAuth,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            var playerId = await cookieAuth.ResolveOrCreatePlayerAsync(httpContext, ct);

            var command = new SubmitAnswerCommand(
                PlayerId:                playerId,
                SessionId:               sessionId,
                DailyChallengeTrackId:   body.DailyChallengeTrackId,
                ListenedDurationSeconds: body.ListenedDurationSeconds,
                WasExtended:             body.WasExtended,
                ArtistAnswer:            body.ArtistAnswer,
                TitleAnswer:             body.TitleAnswer);

            return await bus.InvokeAsync<IResult>(command, ct);
        })
        .WithName("SubmitAnswer")
        .WithTags("Sessions")
        .Produces<SubmitAnswerResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict);

        return routes;
    }
}

public sealed record SubmitAnswerBody(
    int DailyChallengeTrackId,
    int ListenedDurationSeconds,
    bool WasExtended,
    string? ArtistAnswer,
    string? TitleAnswer);
