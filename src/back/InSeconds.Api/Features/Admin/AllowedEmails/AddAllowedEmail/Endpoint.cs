using InSeconds.Api.Features.Admin.Login;
using Wolverine;

namespace InSeconds.Api.Features.Admin.AllowedEmails.AddAllowedEmail;

public static class AddAllowedEmailEndpoint
{
    public static IEndpointRouteBuilder MapAddAllowedEmail(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/allowed-emails", async (
            AddAllowedEmailBody body,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new AddAllowedEmailCommand(body.Email), ct);
        })
        .WithName("AddAllowedEmail")
        .WithTags("Admin")
        .Produces<AddAllowedEmailResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status409Conflict);

        return routes;
    }
}

public sealed record AddAllowedEmailBody(string Email);
