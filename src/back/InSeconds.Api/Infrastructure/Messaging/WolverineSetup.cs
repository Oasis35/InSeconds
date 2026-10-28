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
/// Wolverine, moteur applicatif de l'API : endpoints Wolverine.Http, transactions
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

        opts.CodeGeneration.TypeLoadMode = TypeLoadModeFor(environment);
        // En test, rien n'est écrit dans Internal/Generated : seuls les handlers propres aux tests y sont compilés.
        if (UsesPreBuiltCodeWhenPresent(environment))
            opts.CodeGeneration.SourceCodeWritingEnabled = false;
        // Choisi au démarrage par une fabrique (Brevo, redirigé en staging, capturé en test) : le code
        // généré le demande au conteneur au lieu de le construire lui-même.
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Infrastructure.Email.IEmailSender>();
        // Idem pour les ports Deezer : client HTTP typé et décorateurs de cache, enregistrés par fabrique.
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Deezer.IPreviewProvider>();
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Deezer.ITrackSearch>();
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Deezer.ITrackMetadataSource>();
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Deezer.IAlbumSource>();
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Deezer.CachedTrackSearch>();
        // L'usage des morceaux est fourni par chaque mode (plusieurs ITrackUsage enregistrés) et réuni par Catalogue : le code généré ne peut pas
        // construire cette réunion lui-même, il la demande au conteneur ; le tirage du Daily demande de même son propre port.
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Api.Modules.Catalogue.Contracts.ITrackPoolUsage>();
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Api.Modules.Daily.Application.IDailyTrackUsage>();
        // L'export et l'effacement d'un joueur appellent tous les contributeurs enregistrés (un par mode) : le code généré ne les énumère pas, il
        // demande ces deux services au conteneur (et un test peut y ajouter un contributeur).
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Api.Modules.Players.Application.PlayerDataExporter>();
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Api.Modules.Players.Application.AccountErasure>();
        // L'écriture d'un réglage recharge la source de configuration : son rechargeur est interne à l'infrastructure, le code généré ne peut pas le
        // construire. Utilisé par le réglage du cooldown de l'admin.
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Api.Infrastructure.Settings.SettingsStore>();
        // Le gel offert à la création d'un compte : les tests le remplacent (RecordingStreakGrants), et le code commité,
        // qu'ils relisent, construirait sinon DailyStreakGrants en dur.
        opts.CodeGeneration.AlwaysUseServiceLocationFor<InSeconds.Api.Modules.Daily.Contracts.IStreakGrants>();
        // Compilateur à l'exécution (Wolverine 6 ne l'embarque plus), branché partout : il compile tout en développement
        // (Dynamic) et, en test (Auto), les seuls handlers absents d'Internal/Generated. En prod et en staging (Static),
        // le code de Internal/Generated est lu tel quel.
        opts.UseRuntimeCompilation();
    }

    /// <summary>
    /// En prod et en staging, le code des handlers est généré au build (<c>codegen write</c>, dossier
    /// <c>Internal/Generated</c>) : rien n'est compilé au démarrage. La CI vérifie qu'il est à jour.
    /// </summary>
    public static bool UsesStaticCodegen(IHostEnvironment environment) =>
        environment.IsProduction() || environment.IsStaging();

    /// <summary>
    /// En test (tests d'intégration, hôte des E2E), le code de <c>Internal/Generated</c> est relu quand il existe, et seuls
    /// les handlers absents (ceux des tests, de l'hôte de test) sont compilés au démarrage : chaque API de test recompilait
    /// sinon tous les handlers, soit la moitié du temps de calcul de la suite. Le code commité doit donc être à jour
    /// (vérifié par la CI) : après un changement de handler, le régénérer avant de lancer les tests.
    /// </summary>
    public static bool UsesPreBuiltCodeWhenPresent(IHostEnvironment environment) =>
        environment.IsEnvironment("Testing");

    private static TypeLoadMode TypeLoadModeFor(IHostEnvironment environment) =>
        UsesStaticCodegen(environment) ? TypeLoadMode.Static
        : UsesPreBuiltCodeWhenPresent(environment) ? TypeLoadMode.Auto
        : TypeLoadMode.Dynamic;

    public static WebApplication MapInSecondsEndpoints(this WebApplication app)
    {
        app.MapWolverineEndpoints(opts =>
        {
            opts.UseFluentValidationProblemDetailMiddleware();
            // Tout /api/admin exige la policy Admin : un endpoint admin ne peut pas être oublié.
            opts.ConfigureEndpoints(chain =>
            {
                if (chain.RoutePattern?.RawText?.StartsWith("/api/admin", StringComparison.OrdinalIgnoreCase) == true)
                    chain.RequireAuthorization(Auth.AuthorizationPolicies.Admin);
            });
        });
        return app;
    }
}
