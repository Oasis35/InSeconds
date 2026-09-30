using InSeconds.Api.Infrastructure.Persistence;
using JasperFx.CodeGeneration;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.FluentValidation;
using Wolverine.Http;
using Wolverine.Http.FluentValidation;
using Wolverine.Postgresql;

namespace InSeconds.Api.Infrastructure.Messaging;

/// <summary>
/// Wolverine, moteur applicatif de la v2 (§ 5.2 du plan) : endpoints Wolverine.Http, transactions
/// EF automatiques, outbox PostgreSQL dans le schéma <c>messaging</c>, validation FluentValidation.
/// </summary>
public static class WolverineSetup
{
    public static WebApplicationBuilder AddInSecondsWolverine(this WebApplicationBuilder builder, string connectionString)
    {
        var environment = builder.Environment;
        builder.Host.UseWolverine(opts => Configure(opts, connectionString, environment));
        builder.Services.AddWolverineHttp();
        return builder;
    }

    internal static void Configure(WolverineOptions opts, string connectionString, IHostEnvironment environment)
    {
        // Sous WebApplicationFactory, l'assembly d'entrée est celui des tests.
        opts.ApplicationAssembly = typeof(Program).Assembly;

        opts.PersistMessagesWithPostgresql(
            DatabaseServiceCollectionExtensions.WithExtensionsSearchPath(connectionString), DbSchemas.Messaging);
        opts.UseEntityFrameworkCoreTransactions();
        // Les handlers n'appellent jamais SaveChangesAsync : Wolverine ouvre la transaction, enregistre
        // la donnée et les messages en attente ensemble, puis envoie ces derniers.
        opts.Policies.AutoApplyTransactions();
        opts.Policies.UseDurableLocalQueues();
        opts.UseFluentValidation();

        opts.CodeGeneration.TypeLoadMode = UsesStaticCodegen(environment) ? TypeLoadMode.Static : TypeLoadMode.Dynamic;
        // Compilation à l'exécution en développement et en test seulement (Wolverine 6 ne l'embarque plus).
        opts.UseRuntimeCompilation();
    }

    /// <summary>
    /// En prod et en staging, le code des handlers est généré au build (<c>codegen write</c>, dossier
    /// <c>Internal/Generated</c>) : rien n'est compilé au démarrage. La CI vérifie qu'il est à jour.
    /// </summary>
    public static bool UsesStaticCodegen(IHostEnvironment environment) =>
        environment.IsProduction() || environment.IsStaging();

    public static WebApplication MapInSecondsEndpoints(this WebApplication app)
    {
        app.MapWolverineEndpoints(opts =>
        {
            opts.UseFluentValidationProblemDetailMiddleware();
            // Tout /api/admin exige la policy Admin : un endpoint admin ne peut pas être oublié (§ 5.5).
            opts.ConfigureEndpoints(chain =>
            {
                if (chain.RoutePattern?.RawText?.StartsWith("/api/admin", StringComparison.OrdinalIgnoreCase) == true)
                    chain.RequireAuthorization(Auth.AuthorizationPolicies.Admin);
            });
        });
        return app;
    }
}
