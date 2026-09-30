using Hangfire;
using Hangfire.PostgreSql;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Infrastructure.Persistence;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>
/// Hangfire décide quand lancer les tâches (cron), garde l'historique, réessaie et fournit le
/// tableau de bord <c>/jobs</c> (§ 5.4 bis du plan v2). Stockage PostgreSQL dans le schéma <c>jobs</c>.
/// </summary>
public static class JobsSetup
{
    public const string DashboardPath = "/jobs";

    public static IServiceCollection AddInSecondsJobs(
        this IServiceCollection services, string connectionString, IConfiguration configuration)
    {
        services.AddHangfire(config => config
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UseFilter(new JobTracingFilter())
            .UsePostgreSqlStorage(
                options => options.UseNpgsqlConnection(connectionString),
                new PostgreSqlStorageOptions
                {
                    SchemaName = DbSchemas.Jobs,
                    PrepareSchemaIfNecessary = true,
                    // LISTEN/NOTIFY : une tâche lancée depuis l'admin démarre tout de suite, sans attendre la scrutation.
                    EnableLongPolling = true,
                }));

        services.AddHostedService<RecurringJobsRegistrar>();

        // Le serveur (qui exécute les tâches) ne tourne pas dans les tests d'intégration : ils appellent
        // les tâches directement (Jobs:Server:Enabled=false).
        if (configuration.GetValue("Jobs:Server:Enabled", defaultValue: true))
            // Quelques tâches par jour : deux exécutions en parallèle suffisent (défaut de Hangfire :
            // jusqu'à 20, chacune avec sa connexion à la base).
            services.AddHangfireServer(options =>
                options.WorkerCount = configuration.GetValue("Jobs:Server:WorkerCount", defaultValue: 2));

        return services;
    }

    public static WebApplication MapInSecondsJobsDashboard(this WebApplication app)
    {
        app.MapHangfireDashboard(DashboardPath, new DashboardOptions
        {
            // Sans cette ligne, le filtre « local uniquement » de Hangfire reste actif en plus de la
            // policy (constat A4) : c'est la policy Admin seule qui décide.
            Authorization = [],
            DashboardTitle = "InSeconds · tâches planifiées",
            DisplayStorageConnectionString = false,
        }).RequireAuthorization(AuthorizationPolicies.Admin);
        return app;
    }
}
