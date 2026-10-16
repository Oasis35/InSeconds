using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Time;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

namespace InSeconds.Api.Infrastructure.Health;

public static class HealthEndpoints
{
    private const string ReadyTag = "ready";

    public static IServiceCollection AddInSecondsHealthChecks(this IServiceCollection services)
    {
        services.AddHealthChecks().AddDbContextCheck<InSecondsDbContext>("database", tags: [ReadyTag]);
        return services;
    }

    public static IEndpointRouteBuilder MapInSecondsHealth(this IEndpointRouteBuilder routes)
    {
        var build = BuildInfo.BuildUtc;

        // Liveness. Même format qu'en v1 : { status, utc, build }, lu par le badge d'état du front
        // (on peut ajouter un champ, jamais en retirer). build = date UTC de compilation.
        routes.MapGet("/health", (IGameCalendar calendar) =>
            Results.Ok(new HealthResponse("ok", calendar.Now, build)));

        // Readiness : la base répond.
        routes.MapHealthChecks("/health/ready", new HealthCheckOptions
        {
            Predicate = check => check.Tags.Contains(ReadyTag),
        });

        return routes;
    }
}

public sealed record HealthResponse(string Status, DateTimeOffset Utc, string? Build);
