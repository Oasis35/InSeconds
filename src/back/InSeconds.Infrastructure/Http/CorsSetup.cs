using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Infrastructure.Http;

/// <summary>
/// CORS de l'API, repris de la v1 : le front appelle l'API sur un autre sous-domaine
/// (<c>dev.inseconds.cc</c> → <c>api-dev.inseconds.cc</c> en staging), avec le cookie. Origines
/// autorisées dans <see cref="AllowedOriginsKey"/>, aucune par défaut : en développement et en E2E,
/// le front passe par le proxy d'<c>ng serve</c>, donc par la même origine que l'API.
/// </summary>
public static class CorsSetup
{
    public const string AllowedOriginsKey = "Cors:AllowedOrigins";

    public static IServiceCollection AddInSecondsCors(this IServiceCollection services, IConfiguration configuration)
    {
        var origins = configuration.GetSection(AllowedOriginsKey).Get<string[]>() ?? [];
        services.AddCors(options => options.AddDefaultPolicy(policy => policy
            .WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));
        return services;
    }

    /// <summary>
    /// Après la gestion des erreurs : le middleware CORS pose ses en-têtes au démarrage de la réponse,
    /// ils restent donc sur un 500 et le front peut lire le code d'erreur. Avant l'authentification et
    /// le rate limiting : une requête préalable (<c>OPTIONS</c>) reçoit sa réponse sans cookie et ne
    /// consomme aucun quota.
    /// </summary>
    public static IApplicationBuilder UseInSecondsCors(this IApplicationBuilder app) => app.UseCors();
}
