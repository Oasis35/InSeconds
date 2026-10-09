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

    /// <summary>
    /// Durée pendant laquelle Hangfire garde le détail d'une exécution terminée (état, compte rendu, erreur), lu par
    /// <c>GET /api/admin/jobs/last-runs</c> et par <c>/jobs</c>. Le défaut de Hangfire est de 24 h : un week-end sans
    /// regarder l'admin effacerait le témoin.
    /// </summary>
    public static readonly TimeSpan ExecutionRetention = TimeSpan.FromDays(7);

    private static readonly Lock FilterLock = new();

    public static IServiceCollection AddInSecondsJobs(
        this IServiceCollection services, string connectionString, IConfiguration configuration)
    {
        // Les filtres de Hangfire sont une liste **globale** au processus : un filtre ajouté à chaque configuration
        // s'empile quand plusieurs API tournent dans le même processus (les tests d'intégration en créent une par
        // test), et Hangfire finit par déborder de sa pile en les enchaînant (constat C1). Ajouté une seule fois.
        lock (FilterLock)
        {
            if (!GlobalJobFilters.Filters.Any(filter => filter.Instance is JobTracingFilter))
                GlobalJobFilters.Filters.Add(new JobTracingFilter());
        }

        services.AddHangfire(config => config
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(
                options => options.UseNpgsqlConnection(connectionString),
                new PostgreSqlStorageOptions
                {
                    SchemaName = DbSchemas.Jobs,
                    PrepareSchemaIfNecessary = true,
                    // LISTEN/NOTIFY : une tâche lancée depuis /jobs démarre tout de suite, sans attendre la scrutation.
                    EnableLongPolling = true,
                })
            .WithJobExpirationTimeout(ExecutionRetention));

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
