using Wolverine;

namespace InSeconds.Api.Features.Admin.Login;

public static class LoginEndpoint
{
    public const string AdminToken = "admin-token";

    public static IEndpointRouteBuilder MapAdminLogin(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/login", async (LoginBody body, IMessageBus bus, CancellationToken ct) =>
            await bus.InvokeAsync<IResult>(new LoginCommand(body.Password), ct))
        .WithName("AdminLogin")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        routes.MapPost("/api/admin/logout", () => Results.Ok())
        .WithName("AdminLogout")
        .WithTags("Admin");

        routes.MapGet("/api/admin/me", (HttpContext ctx) =>
            IsAdminAuthenticated(ctx) ? Results.Ok() : Results.Unauthorized())
        .WithName("AdminMe")
        .WithTags("Admin");

        return routes;
    }

    public static bool IsAdminAuthenticated(HttpContext ctx)
    {
        var auth = ctx.Request.Headers.Authorization.ToString();
        return auth == $"Bearer {AdminToken}";
    }
}

public sealed record LoginBody(string Password);
