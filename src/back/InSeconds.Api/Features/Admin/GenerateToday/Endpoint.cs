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

            var result = await generator.GenerateAsync(ct);
            return result switch
            {
                GenerateResult.Success          => Results.Ok(),
                GenerateResult.AlreadyExists    => Results.Conflict(new { error = "already_exists", message = "Le défi du jour est déjà généré." }),
                GenerateResult.PoolInsufficient => Results.UnprocessableEntity(new { error = "pool_insufficient", message = "Pool insuffisant : pas assez de morceaux avec preview disponible." }),
                _                               => Results.StatusCode(500),
            };
        })
        .WithName("GenerateToday")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK);

        return routes;
    }
}
