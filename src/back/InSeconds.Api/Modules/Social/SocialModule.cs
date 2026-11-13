using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Application;
using InSeconds.Api.Modules.Social.Domain;
using InSeconds.Api.Modules.Social.Persistence;

namespace InSeconds.Api.Modules.Social;

/// <summary>
/// Module Social : les groupes entre amis (un compte par membre), leurs codes d'invitation et leur classement. Un noyau, comme Players et Catalogue : il
/// ne connaît aucun mode de jeu (chacun lui donne la performance de ses joueurs par <c>IMemberPerformanceSource</c>) et n'utilise des autres modules que
/// leurs <c>Contracts</c>. Schéma <c>social</c>.
/// </summary>
public static class SocialModule
{
    public static IServiceCollection AddSocial(this IServiceCollection services)
    {
        services.AddOptions<SocialOptions>().BindConfiguration(SocialOptions.Section);
        services.AddSingleton<SocialRules>();
        services.AddSingleton<SocialMetrics>();
        services.AddScoped<IGroupStore, EfGroupStore>();
        services.AddScoped<ISocialQueries, EfSocialQueries>();
        services.AddScoped<IRankingVisibilityStore, EfRankingVisibilityStore>();
        services.AddScoped<GroupRanking>();
        return services;
    }

    /// <summary>
    /// La copie et l'effacement des données de groupe d'un joueur (ses droits RGPD). Enregistré par <c>ApiComposition.AddPlayerDataContributors</c>,
    /// partagé par l'API et la commande de secours, jamais par <see cref="AddSocial"/>.
    /// </summary>
    public static IServiceCollection AddSocialPlayerData(this IServiceCollection services) =>
        services.AddScoped<IPlayerDataContributor, SocialPlayerData>();
}
