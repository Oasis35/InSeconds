using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;

namespace InSeconds.Api.Modules.Gameplay;

/// <summary>
/// Module Gameplay (§ 3.1 du plan v2) : la mécanique d'un morceau, partagée par les modes (Daily aujourd'hui,
/// Runs plus tard) : <see cref="TrackRound"/> (écouter, indice, répondre), la correction des réponses, les
/// indices, le tirage à graine. Il n'a **ni table, ni route, ni réglage** : de la logique pure, que les modes
/// appellent par leur <c>Contracts</c>. Ne dépend que de <c>Catalogue/Contracts</c> (testé), et pas de l'accès
/// aux données ni du web.
/// </summary>
public static class GameplayModule
{
    public static IServiceCollection AddGameplay(this IServiceCollection services)
    {
        services.AddSingleton<IAnswerMatcher, FuzzyAnswerMatcher>();
        services.AddSingleton<ISeededShuffle, FisherYatesShuffle>();
        // Un fournisseur par élément révélé, dans l'ordre des niveaux : un indice de plus s'ajoute ici.
        services.AddSingleton<IHintProvider, YearHint>();
        services.AddSingleton<IHintProvider, HangmanArtistHint>();
        return services;
    }
}
