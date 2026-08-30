using InSeconds.Api.Features.Admin.Login;
using Wolverine;

namespace InSeconds.Api.Features.Admin.AllowedEmails.RemoveAllowedEmail;

public static class RemoveAllowedEmailEndpoint
{
    public static IEndpointRouteBuilder MapRemoveAllowedEmail(this IEndpointRouteBuilder routes)
    {
        routes.MapDelete("/api/admin/allowed-emails/{id:int}", async (
            int id,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new RemoveAllowedEmailCommand(id), ct);
        })
        .WithName("RemoveAllowedEmail")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status404NotFound);

        return routes;
    }
}
