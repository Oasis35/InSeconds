using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Health;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Infrastructure.Messaging;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Infrastructure.Email;
using InSeconds.Infrastructure.Http;
using InSeconds.Infrastructure.Networking;
using InSeconds.Infrastructure.Observability;
using InSeconds.Infrastructure.RateLimiting;

namespace InSeconds.Api.Infrastructure.Hosting;

/// <summary>
/// Composition de l'API, partagée par <c>Program</c> et l'hôte de test (<c>InSeconds.Api.Testing</c>),
/// qui n'y ajoute que ses faux et ses routes <c>/api/e2e</c>.
/// </summary>
public static class ApiComposition
{
    public static WebApplicationBuilder AddInSecondsApi(this WebApplicationBuilder builder, string[] args)
    {
        var configuration = builder.Configuration;
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

        // Réglages lus en base, sauf pour une commande qui ne démarre pas l'API (la CI génère le code
        // Wolverine sans base).
        if (CommandLine.StartsServer(args))
            builder.AddDatabaseSettings(connectionString);

        builder.AddInSecondsObservability(BuildInfo.BuildUtc ?? "unknown");
        builder.Services.AddInSecondsDatabase(connectionString);
        // Enregistré avant Wolverine et Hangfire : les migrations passent avant leur démarrage.
        builder.Services.AddDatabaseMigrationOnStartup();
        builder.Services.AddGameCalendar();
        builder.Services.AddInSecondsProblemDetails();
        builder.Services.AddInSecondsHealthChecks();
        builder.Services.AddInSecondsAuth();
        builder.Services.AddInSecondsForwardedHeaders();
        builder.Services.AddInSecondsRateLimiting(configuration);
        builder.Services.AddInSecondsEmail(configuration, builder.Environment);
        builder.AddInSecondsWolverine(connectionString);
        builder.Services.AddInSecondsJobs(connectionString, configuration);
        return builder;
    }

    public static WebApplication UseInSecondsApi(this WebApplication app)
    {
        // En premier : tout ce qui suit (rate limiting, journaux) voit l'IP réelle du joueur.
        app.UseForwardedHeaders();
        app.UseInSecondsSecurityHeaders();
        app.UseInSecondsErrorHandling();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapInSecondsHealth();
        app.MapInSecondsEndpoints();
        app.MapInSecondsJobsDashboard();
        return app;
    }
}
