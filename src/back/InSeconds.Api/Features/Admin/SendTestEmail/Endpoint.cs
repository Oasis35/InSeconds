using InSeconds.Api.Features.Admin.Login;
using Wolverine;

namespace InSeconds.Api.Features.Admin.SendTestEmail;

public static class SendTestEmailEndpoint
{
    public static IEndpointRouteBuilder MapSendTestEmail(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/send-test-email", async (
            SendTestEmailBody body,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new SendTestEmailCommand(body.ToEmail), ct);
        })
        .WithName("SendTestEmail")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status500InternalServerError);

        return routes;
    }
}

public sealed record SendTestEmailBody(string ToEmail);
