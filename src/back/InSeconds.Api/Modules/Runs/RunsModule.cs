using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.Api.Modules.Runs.Persistence;

namespace InSeconds.Api.Modules.Runs;

/// <summary>
/// Module Runs (nom affiché « Platines ») : le second mode de jeu, solo, en manches de difficulté croissante, dont le défi (une playlist) se partage
/// par un lien : son schéma <c>runs</c>, le défi et son tirage, les réglages <c>Runs:</c>, l'accès sur invitation et la partie (jauge, neutralisation,
/// fin, record). Runs n'utilise des autres modules que leurs <c>Contracts</c> et ne voit jamais Daily.
/// </summary>
public static class RunsModule
{
    public static IServiceCollection AddRuns(this IServiceCollection services)
    {
        services.AddOptions<RunsOptions>().BindConfiguration(RunsOptions.Section);
        services.AddSingleton<RunsRules>();
        services.AddHostedService<RunsOptionsStartupCheck>();
        services.AddSingleton<IRunTrackSelector, RankBandSelector>();
        services.AddScoped<IRunsStore, EfRunsStore>();
        services.AddScoped<IRunsQueries, EfRunsQueries>();
        services.AddScoped<IRunAccess, EfRunAccess>();
        services.AddScoped<RunChallengePlanner>();
        services.AddSingleton<IRunScoringPolicy, ArtistTitleScoring>();
        services.AddScoped<RunPlayer>();
        // Compteurs des parties et des réponses, exportés en OpenTelemetry (tableau Grafana « Activité »).
        services.AddSingleton<RunsMetrics>();
        // L'usage des morceaux : **ajouté**, jamais remplacé (Catalogue réunit l'ITrackUsage de chaque mode).
        services.AddScoped<ITrackUsage, RunsTrackUsage>();
        return services;
    }

    /// <summary>
    /// La copie et l'effacement des données de jeu d'un joueur (ses droits RGPD) : Runs est un contributeur de Players. Enregistré par
    /// <c>ApiComposition.AddPlayerDataContributors</c>, partagé par l'API et la commande de secours, jamais par <see cref="AddRuns"/>.
    /// </summary>
    public static IServiceCollection AddRunsPlayerData(this IServiceCollection services) =>
        services.AddScoped<IPlayerDataContributor, RunsPlayerData>();
}
