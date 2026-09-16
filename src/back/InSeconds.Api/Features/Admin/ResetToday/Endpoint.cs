using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Admin.ResetToday;

public static class ResetTodayEndpoint
{
    public static IEndpointRouteBuilder MapResetToday(this IEndpointRouteBuilder routes)
    {
        routes.MapDelete("/api/admin/reset-today", async (
            IMessageBus bus,
            HttpContext ctx,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new ResetTodayCommand(), ct);
        })
        .WithName("ResetToday")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status404NotFound);

        return routes;
    }
}
