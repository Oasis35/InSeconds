using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Deezer;

public sealed class DeezerOptions
{
    public const string Section = "Deezer";

    public string BaseUrl { get; set; } = "https://api.deezer.com";

    /// <summary>
    /// Résilience HTTP (timeout, nouvelles tentatives, coupe-circuit). <c>false</c> dans les tests, par la
    /// configuration de leur environnement : jamais de condition sur l'environnement dans le code.
    /// </summary>
    public bool ResilienceEnabled { get; set; } = true;
}

public static class DeezerServiceCollectionExtensions
{
    /// <summary>
    /// Enregistre le client Deezer et ses trois ports. <see cref="IPreviewProvider"/> est le décorateur à
    /// cache (l'extrait suffit au jeu) ; <see cref="ITrackSearch"/> et <see cref="ITrackMetadataSource"/>
    /// sont le client brut, l'état réel chez Deezer ; la recherche publique demande
    /// <see cref="CachedTrackSearch"/>. Ce sont des fabriques : l'API déclare ces types à Wolverine
    /// (<see cref="ServiceLocationTypes"/>).
    /// </summary>
    public static IServiceCollection AddDeezer(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(DeezerOptions.Section).Get<DeezerOptions>() ?? new();

        services.AddSingleton<DeezerCache>();
        var http = services.AddHttpClient<DeezerClient>(client => client.BaseAddress = new Uri(options.BaseUrl));
        if (options.ResilienceEnabled)
        {
            // Timeout court par tentative, nouvelles tentatives exponentielles (429, 5xx) et coupe-circuit :
            // un appel Deezer lent ne doit pas bloquer une requête du joueur (le délai par défaut est de 100 s).
            http.AddStandardResilienceHandler(resilience =>
            {
                resilience.AttemptTimeout.Timeout = TimeSpan.FromSeconds(4);
                resilience.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(15);
                resilience.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
            });
        }

        services.AddTransient<ITrackMetadataSource>(sp => sp.GetRequiredService<DeezerClient>());
        services.AddTransient<ITrackSearch>(sp => sp.GetRequiredService<DeezerClient>());
        services.AddTransient<IPreviewProvider>(sp => new CachedPreviewProvider(
            sp.GetRequiredService<DeezerClient>(), sp.GetRequiredService<DeezerCache>().Memory, sp.GetRequiredService<TimeProvider>()));
        services.AddTransient(sp => new CachedTrackSearch(
            sp.GetRequiredService<DeezerClient>(), sp.GetRequiredService<DeezerCache>().Memory));
        return services;
    }

    /// <summary>
    /// Les types que le code Wolverine généré doit demander au conteneur : enregistrés par fabrique (client
    /// HTTP typé, décorateurs), il ne peut pas les construire lui-même.
    /// </summary>
    public static IReadOnlyList<Type> ServiceLocationTypes { get; } =
        [typeof(IPreviewProvider), typeof(ITrackSearch), typeof(ITrackMetadataSource), typeof(CachedTrackSearch)];

    /// <summary>
    /// Remplace le transport HTTP du client Deezer (l'hôte de test y met son faux). Les tests ne parlent
    /// jamais au vrai Deezer.
    /// </summary>
    public static IServiceCollection ReplaceDeezerHttpHandler(
        this IServiceCollection services, Func<IServiceProvider, HttpMessageHandler> createHandler)
    {
        services.AddHttpClient<DeezerClient>().ConfigurePrimaryHttpMessageHandler(createHandler);
        return services;
    }
}
