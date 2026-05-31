using Wolverine;

namespace InSeconds.Api.Features.Admin.ResetToday;

public static class ResetTodayEndpoint
{
    public static IEndpointRouteBuilder MapResetToday(this IEndpointRouteBuilder routes)
    {
        routes.MapDelete("/api/admin/reset-today", async (
            IMessageBus bus,
            IHostEnvironment env,
            CancellationToken ct) =>
        {
            if (!env.IsDevelopment())
                return Results.NotFound();

            return await bus.InvokeAsync<IResult>(new ResetTodayCommand(), ct);
        })
        .WithName("ResetToday")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status404NotFound);

        return routes;
    }
}
