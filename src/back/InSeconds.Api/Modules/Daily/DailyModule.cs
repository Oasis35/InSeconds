using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Daily.Persistence;
using InSeconds.Api.Modules.Players.Contracts;

namespace InSeconds.Api.Modules.Daily;

/// <summary>
/// Module Daily : le défi du jour. Les défis (<c>daily.challenges</c> et <c>daily.challenge_tracks</c>), leur génération
/// (nocturne, à la volée, bouton de l'admin) et l'usage des morceaux que le cooldown en tire ; les parties (<c>daily.sessions</c> et
/// <c>daily.answers</c>), le score, la série et les gels (<c>daily.streaks</c>), et le gel offert à la création d'un compte (<see cref="IStreakGrants"/>) ;
/// les statistiques, la photo figée des jours terminés, les réponses des jours passés et l'admin du jeu.
/// </summary>
public static class DailyModule
{
    public static IServiceCollection AddDaily(this IServiceCollection services)
    {
        services.AddOptions<DailyOptions>().BindConfiguration(DailyOptions.Section);
        services.AddScoped<IDailyStore, EfDailyStore>();
        services.AddScoped<IDailyQueries, EfDailyQueries>();
        services.AddScoped<IDailyStatsQueries, EfDailyStatsQueries>();
        services.AddSingleton<ITrackSelector, CooldownSeededSelector>();
        // Les règles du jeu lues à chaud dans les réglages (paliers, barème, indices, gels), et le contrôle de leur cohérence au démarrage.
        services.AddSingleton<DailyRules>();
        services.AddHostedService<DailyOptionsStartupCheck>();
        // Compteurs des parties et des réponses, exportés en OpenTelemetry (tableau Grafana « Activité »).
        services.AddSingleton<DailyMetrics>();
        // Le cooldown des morceaux, déduit de la taille du pool à chaque appel (#275).
        services.AddScoped<TrackCooldownPolicy>();
        // L'usage réel des morceaux, calculé sur les défis. **Ajouté, jamais remplacé** : Catalogue réunit l'ITrackUsage de chaque mode
        // (ITrackPoolUsage). Le tirage du jour injecte IDailyTrackUsage (résolu par le conteneur dans le code généré : service location).
        services.AddScoped<EfTrackUsage>();
        services.AddScoped<IDailyTrackUsage>(sp => sp.GetRequiredService<EfTrackUsage>());
        services.AddScoped<ITrackUsage>(sp => sp.GetRequiredService<EfTrackUsage>());
        services.AddScheduledJob<GenerateDailyChallengeJob>(GenerateDailyChallengeJob.Id, GenerateDailyChallengeJob.DefaultCron);
        // Fige les statistiques de l'avant-veille. Tourne aussi en staging : elle n'appelle pas Deezer.
        services.AddScheduledJob<DailyCloseDayJob>(DailyCloseDayJob.Id, DailyCloseDayJob.DefaultCron);
        services.AddScoped<IStreakGrants, DailyStreakGrants>();
        return services;
    }

    /// <summary>
    /// La copie et l'effacement des données de jeu d'un joueur (ses droits RGPD) : Daily est un contributeur de Players. Enregistré par
    /// <c>ApiComposition.AddPlayerDataContributors</c>, partagé par l'API et la commande de secours, jamais par <see cref="AddDaily"/>.
    /// </summary>
    public static IServiceCollection AddDailyPlayerData(this IServiceCollection services) =>
        services.AddScoped<IPlayerDataContributor, DailyPlayerData>();
}
