using InSeconds.Api.Features.Admin.Login;

namespace InSeconds.Api.Features.Admin.AllowedEmails.GetAllowedEmails;

public static class GetAllowedEmailsEndpoint
{
    public static IEndpointRouteBuilder MapGetAllowedEmails(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/allowed-emails", async (
            HttpContext ctx,
            GetAllowedEmailsHandler handler,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            return await handler.Handle(ct);
        })
        .WithName("GetAllowedEmails")
        .WithTags("Admin")
        .Produces<GetAllowedEmailsResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }
}
