using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Api.Modules.Catalogue.Persistence;

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
        // L'usage des morceaux est fourni par chaque mode (ITrackUsage, ajouté, jamais remplacé) ; Catalogue les réunit.
        services.AddScoped<ITrackPoolUsage, TrackPoolUsage>();
        services.AddScheduledJob<RefreshPreviewsJob>(RefreshPreviewsJob.Id, RefreshPreviewsJob.DefaultCron);
        services.AddExceptionHandler<TrackConflictExceptionHandler>();
        return services;
    }
}
