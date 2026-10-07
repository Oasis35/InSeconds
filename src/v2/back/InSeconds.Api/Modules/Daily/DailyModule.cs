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
/// Module Daily (§ 3.1 du plan v2) : le défi du jour. Depuis E1 : les défis (<c>daily.challenges</c> et
/// <c>daily.challenge_tracks</c>), leur génération (nocturne, à la volée, bouton de l'admin) et l'usage des
/// morceaux que le cooldown en tire. Les parties, la série et les gels arrivent en E2 ; son contrat
/// <see cref="IStreakGrants"/> est préparé depuis B2 (gel offert à la création d'un compte).
/// </summary>
public static class DailyModule
{
    public static IServiceCollection AddDaily(this IServiceCollection services)
    {
        services.AddOptions<DailyOptions>().BindConfiguration(DailyOptions.Section);
        services.AddScoped<IDailyStore, EfDailyStore>();
        services.AddSingleton<ITrackSelector, CooldownSeededSelector>();
        // L'usage réel des morceaux, calculé sur les défis : remplace « aucun usage » de Catalogue (enregistré par
        // AddCatalogue, appelé avant). ITrackUsage est résolu par le conteneur dans le code généré (service location).
        services.Replace(ServiceDescriptor.Scoped<ITrackUsage, EfTrackUsage>());
        services.AddScheduledJob<GenerateDailyChallengeJob>(GenerateDailyChallengeJob.Id, GenerateDailyChallengeJob.DefaultCron);
        // Le bouton de l'admin : une tâche en pause, sans réessai (cf. GenerateDailyChallengeAdminJob).
        services.AddScheduledJob<GenerateDailyChallengeAdminJob>(GenerateDailyChallengeAdminJob.Id, Cron.Never());
        services.AddScoped<IStreakGrants, StreakGrantsNotYetImplemented>();
        return services;
    }
}

/// <summary>
/// En attendant la série et les gels (E2) : rien à accorder. E2 remplace cette classe par
/// l'implémentation réelle, sans changer Players.
/// </summary>
public sealed class StreakGrantsNotYetImplemented : IStreakGrants
{
    public Task GrantAccountCreationFreezeAsync(Guid playerId, CancellationToken ct) => Task.CompletedTask;
}
