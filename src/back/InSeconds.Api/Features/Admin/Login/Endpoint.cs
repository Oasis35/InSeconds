namespace InSeconds.Api.Features.Admin.Login;

public static class LoginEndpoint
{
    private const string AdminCookieName = "admin_session";

    public static IEndpointRouteBuilder MapAdminLogin(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/login", (LoginBody body, IConfiguration config, HttpContext ctx) =>
        {
            var adminPassword = config["AdminPassword"];
            if (string.IsNullOrEmpty(adminPassword) || body.Password != adminPassword)
                return Results.Unauthorized();

            ctx.Response.Cookies.Append(AdminCookieName, "1", new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.None,
                Expires = DateTimeOffset.UtcNow.AddHours(8),
            });

            return Results.Ok();
        })
        .WithName("AdminLogin")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        routes.MapPost("/api/admin/logout", (HttpContext ctx) =>
        {
            ctx.Response.Cookies.Delete(AdminCookieName, new CookieOptions
            {
                Secure = true,
                SameSite = SameSiteMode.None,
            });
            return Results.Ok();
        })
        .WithName("AdminLogout")
        .WithTags("Admin");

        routes.MapGet("/api/admin/me", (HttpContext ctx) =>
            ctx.Request.Cookies.ContainsKey(AdminCookieName)
                ? Results.Ok()
                : Results.Unauthorized())
        .WithName("AdminMe")
        .WithTags("Admin");

        return routes;
    }

    public static bool IsAdminAuthenticated(HttpContext ctx) =>
        ctx.Request.Cookies.ContainsKey(AdminCookieName);
}

public sealed record LoginBody(string Password);
