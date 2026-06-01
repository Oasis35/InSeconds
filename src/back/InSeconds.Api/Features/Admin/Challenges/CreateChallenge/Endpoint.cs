using InSeconds.Api.Features.Admin.Login;
using Wolverine;

namespace InSeconds.Api.Features.Admin.Challenges.CreateChallenge;

public static class CreateChallengeEndpoint
{
    public static IEndpointRouteBuilder MapCreateChallenge(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/challenges", async (
            CreateChallengeBody body,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            if (body.DeezerTrackIds is null || body.DeezerTrackIds.Count == 0 || body.DeezerTrackIds.Count > 3)
                return Results.BadRequest(new { error = "invalid_tracks", message = "Entre 1 et 3 tracks requis." });

            if (body.DeezerTrackIds.Distinct().Count() != body.DeezerTrackIds.Count)
                return Results.BadRequest(new { error = "duplicate_tracks", message = "Les tracks doivent être distinctes." });

            return await bus.InvokeAsync<IResult>(
                new CreateChallengeCommand(body.Date, body.DeezerTrackIds), ct);
        })
        .WithName("CreateChallenge")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status409Conflict)
        .Produces(StatusCodes.Status422UnprocessableEntity);

        return routes;
    }
}

public sealed record CreateChallengeBody(DateOnly Date, IReadOnlyList<long> DeezerTrackIds);
