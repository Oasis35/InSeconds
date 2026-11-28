using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;

namespace InSeconds.Api.Modules.Gameplay;

/// <summary>
/// Module Gameplay : la mécanique d'un morceau, partagée par les modes (Daily,
/// Runs) : <see cref="TrackRound"/> (écouter, répondre), la correction des réponses, le
/// tirage à graine. Il n'a **ni table, ni route, ni réglage** : de la logique pure, que les modes
/// appellent par leur <c>Contracts</c>. Ne dépend d'aucun autre module (seul <c>Catalogue/Contracts</c> lui
/// serait permis), ni de l'accès aux données, ni du web : testé par les règles d'architecture.
/// </summary>
public static class GameplayModule
{
    public static IServiceCollection AddGameplay(this IServiceCollection services)
    {
        services.AddSingleton<IAnswerMatcher, FuzzyAnswerMatcher>();
        services.AddSingleton<ISeededShuffle, FisherYatesShuffle>();
        return services;
    }
}
