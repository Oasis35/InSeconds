using Hangfire;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Daily.Persistence;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace InSeconds.Api.Modules.Daily;

/// <summary>
/// Module Daily (§ 3.1 du plan v2) : le défi du jour. E1 : les défis (<c>daily.challenges</c> et <c>daily.challenge_tracks</c>), leur génération
/// (nocturne, à la volée, bouton de l'admin) et l'usage des morceaux que le cooldown en tire. E2 : les parties (<c>daily.sessions</c> et
/// <c>daily.answers</c>), le score, la série et les gels (<c>daily.streaks</c>), et le gel offert à la création d'un compte (<see cref="IStreakGrants"/>,
/// contrat préparé depuis B2).
/// </summary>
public static class DailyModule
{
    public static IServiceCollection AddDaily(this IServiceCollection services)
    {
        services.AddOptions<DailyOptions>().BindConfiguration(DailyOptions.Section);
        services.AddScoped<IDailyStore, EfDailyStore>();
        services.AddScoped<IDailyQueries, EfDailyQueries>();
        services.AddSingleton<ITrackSelector, CooldownSeededSelector>();
        // Les règles du jeu lues à chaud dans les réglages (paliers, barème, indices, gels), et le contrôle de leur cohérence au démarrage.
        services.AddSingleton<DailyRules>();
        services.AddHostedService<DailyOptionsStartupCheck>();
        // L'usage réel des morceaux, calculé sur les défis : remplace « aucun usage » de Catalogue (enregistré par
        // AddCatalogue, appelé avant). ITrackUsage est résolu par le conteneur dans le code généré (service location).
        services.Replace(ServiceDescriptor.Scoped<ITrackUsage, EfTrackUsage>());
        services.AddScheduledJob<GenerateDailyChallengeJob>(GenerateDailyChallengeJob.Id, GenerateDailyChallengeJob.DefaultCron);
        // Le bouton de l'admin : une tâche en pause, sans réessai (cf. GenerateDailyChallengeAdminJob).
        services.AddScheduledJob<GenerateDailyChallengeAdminJob>(GenerateDailyChallengeAdminJob.Id, Cron.Never());
        services.AddScoped<IStreakGrants, DailyStreakGrants>();
        return services;
    }
}
