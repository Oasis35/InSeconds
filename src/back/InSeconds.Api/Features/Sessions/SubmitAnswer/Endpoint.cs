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
            IMessageBus bus,
            CancellationToken ct) =>
        {
            // Pas de Player résolu = visiteur n'ayant jamais démarré de partie (donc jamais
            // eu de cookie posé par StartSession) : aucune session ne peut lui appartenir.
            var playerId = httpContext.GetPlayerIdOrNull();
            if (playerId is null)
                return Results.NotFound();

            var command = new SubmitAnswerCommand(
                PlayerId:                playerId.Value,
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
    decimal ListenedDurationSeconds,
    bool WasExtended,
    string? ArtistAnswer,
    string? TitleAnswer);
