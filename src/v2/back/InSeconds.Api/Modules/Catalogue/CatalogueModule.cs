using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Api.Modules.Catalogue.Persistence;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace InSeconds.Api.Modules.Catalogue;

/// <summary>
/// Module Catalogue (§ 3.1 du plan v2) : les morceaux du pool, leurs métadonnées Deezer (année, rang), l'état de
/// leur extrait, le pool admin. Ses endpoints Wolverine.Http (<c>Application/</c>) sont découverts par Wolverine ;
/// sa table vit dans le schéma <c>catalogue</c>. Le client Deezer (<c>AddDeezer</c>) est enregistré à part,
/// comme les autres adaptateurs.
/// </summary>
public static class CatalogueModule
{
    public static IServiceCollection AddCatalogue(this IServiceCollection services)
    {
        services.AddOptions<CatalogueOptions>().BindConfiguration(CatalogueOptions.Section);
        services.AddOptions<RefreshOptions>().BindConfiguration(RefreshOptions.Section);
        services.AddScoped<ICatalogueStore, EfCatalogueStore>();
        services.AddScoped<ICatalogueQueries, EfCatalogueQueries>();
        services.AddScoped<ITrackDirectory, EfTrackDirectory>();
        services.AddScoped<ITrackPreviews, DeezerTrackPreviews>();
        // Aucun usage tant que Daily n'existe pas (E) : TryAdd, Daily enregistre sa propre implémentation.
        services.TryAddScoped<ITrackUsage, NoTrackUsage>();
        services.AddScheduledJob<RefreshPreviewsJob>(RefreshPreviewsJob.Id, RefreshPreviewsJob.DefaultCron);
        services.AddExceptionHandler<TrackConflictExceptionHandler>();
        return services;
    }
}

/// <summary>
/// En attendant Daily (E) : aucun morceau n'a jamais servi, aucun n'est dans le défi du jour ni en cooldown.
/// Daily remplace cette classe par la lecture de <c>challenge_tracks</c>, sans changer Catalogue.
/// </summary>
public sealed class NoTrackUsage : ITrackUsage
{
    public Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<int, TrackUsage>>(new Dictionary<int, TrackUsage>());

    public Task<IReadOnlySet<int>> GetTracksInCooldownAsync(DateOnly day, CancellationToken ct) =>
        Task.FromResult<IReadOnlySet<int>>(new HashSet<int>());
}
