namespace InSeconds.Api.Features.Admin.Login;

public static class LoginEndpoint
{
    private const string AdminToken = "admin-token";

    public static IEndpointRouteBuilder MapAdminLogin(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/login", (LoginBody body, IConfiguration config) =>
        {
            var adminPassword = config["AdminPassword"];
            if (string.IsNullOrEmpty(adminPassword) || body.Password != adminPassword)
                return Results.Unauthorized();

            return Results.Ok(new { token = AdminToken });
        })
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
