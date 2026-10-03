using InSeconds.Api.Modules.Daily.Contracts;

namespace InSeconds.Api.Modules.Daily;

/// <summary>
/// Module Daily (§ 3.1 du plan v2). Pour l'instant, seul son contrat <see cref="IStreakGrants"/> existe
/// (préparé en B2 pour le gel offert à la création d'un compte) ; la série et les gels arrivent en E2.
/// </summary>
public static class DailyModule
{
    public static IServiceCollection AddDaily(this IServiceCollection services)
    {
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
