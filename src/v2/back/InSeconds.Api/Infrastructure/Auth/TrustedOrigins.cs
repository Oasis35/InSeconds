namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>
/// Anti-CSRF des routes qui posent un cookie sur un <c>POST</c> (vérification du lien magique,
/// piège 22) : l'<c>Origin</c>, ou à défaut l'autorité exacte du <c>Referer</c>, doit être une origine
/// de confiance. Repris de l'<c>OriginValidator</c> v1. Origines de confiance : <c>Cors:AllowedOrigins</c>
/// (prod, staging) plus <c>Auth:TrustedOrigins</c>, pour les fronts servis par le proxy d'<c>ng serve</c>
/// en développement et en E2E, sans CORS : tous les ports réellement utilisés doivent y être (piège 22).
/// </summary>
public sealed class TrustedOrigins(IConfiguration configuration)
{
    public const string Section = "Auth:TrustedOrigins";

    public bool IsTrusted(HttpRequest request)
    {
        var allowed = Allowed();

        var origin = request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin))
            return allowed.Contains(origin, StringComparer.OrdinalIgnoreCase);

        // Autorité exacte (schéma, hôte, port), jamais un préfixe : un Referer
        // « https://inseconds.cc.attaquant.com/… » ne passe pas pour « https://inseconds.cc ».
        var referer = request.Headers.Referer.ToString();
        if (!string.IsNullOrEmpty(referer) && Uri.TryCreate(referer, UriKind.Absolute, out var refererUri))
            return allowed.Contains(refererUri.GetLeftPart(UriPartial.Authority), StringComparer.OrdinalIgnoreCase);

        // Ni Origin ni Referer : un fetch légitime du front envoie toujours l'un des deux.
        return false;
    }

    // Relu à chaque appel : quelques entrées, et la configuration peut être rechargée.
    private string[] Allowed() =>
    [
        .. configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [],
        .. configuration.GetSection(Section).Get<string[]>() ?? [],
    ];
}
