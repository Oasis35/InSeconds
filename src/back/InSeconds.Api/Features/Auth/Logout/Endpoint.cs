namespace InSeconds.Api.Features.Auth.Logout;

public static class LogoutEndpoint
{
    public static IEndpointRouteBuilder MapLogout(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/auth/logout", (HttpContext ctx, LogoutHandler handler) =>
            handler.Handle(new LogoutCommand(), ctx))
        .WithName("Logout")
        .WithTags("Auth")
        .Produces(StatusCodes.Status200OK);

        return routes;
    }
}
