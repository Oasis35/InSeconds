using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Admin.CheckAdminAuth;

public static class CheckAdminAuthEndpoint
{
    public static IEndpointRouteBuilder MapCheckAdminAuth(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/me", (HttpContext ctx) =>
            ctx.GetPlayerIsAdmin() ? Results.Ok() : Results.Unauthorized())
        .WithName("AdminMe")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }
}
