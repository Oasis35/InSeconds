using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Deezer;

public static class DeezerServiceCollectionExtensions
{
    /// <summary>
    /// Enregistre <see cref="DeezerClient"/>/<see cref="CachedDeezerClient"/> et leur
    /// <see cref="HttpClient"/> typé. En Testing, branche <see cref="FakeDeezerHandler"/>
    /// (interne au module) au lieu de la résilience HTTP réelle.
    /// </summary>
    public static IServiceCollection AddDeezerHttpClient(
        this IServiceCollection services, bool useFakeHandler, string baseUrl = "https://api.deezer.com")
    {
        // SizeLimit borné : conteneur prod à mémoire contrainte, éviter un cache Deezer non borné.
        services.AddMemoryCache(options => options.SizeLimit = 2000);
        services.AddTransient<CachedDeezerClient>();

        var httpBuilder = services.AddHttpClient<DeezerClient>(client =>
        {
            client.BaseAddress = new Uri(baseUrl);
        });

        if (useFakeHandler)
        {
            httpBuilder.ConfigurePrimaryHttpMessageHandler(() => new FakeDeezerHandler());
        }
        else
        {
            // Résilience HTTP sur l'API Deezer : timeout court par tentative, retry
            // exponentiel + circuit breaker. Évite qu'un appel Deezer lent ne bloque
            // StartSession (timeout HttpClient par défaut = 100s).
            httpBuilder.AddStandardResilienceHandler(options =>
            {
                options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(4);
                options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(15);
                options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
            });
        }

        return services;
    }
}
