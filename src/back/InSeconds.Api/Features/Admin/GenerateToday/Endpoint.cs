using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Features.ChallengeGeneration;

namespace InSeconds.Api.Features.Admin.GenerateToday;

public static class GenerateTodayEndpoint
{
    public static IEndpointRouteBuilder MapGenerateToday(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/generate-today", async (
            DailyChallengeGenerator generator,
            HttpContext ctx,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            var generated = await generator.GenerateAsync(ct);
            return generated
                ? Results.Ok()
                : Results.Conflict(new { error = "already_exists", message = "Le défi du jour est déjà généré." });
        })
        .WithName("GenerateToday")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK);

        return routes;
    }
}
