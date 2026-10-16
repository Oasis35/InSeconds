using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace InSeconds.Infrastructure.Http;

/// <summary>
/// En-têtes de sécurité posés sur toutes les réponses de l'API (S15). L'API ne sert que du JSON :
/// sa CSP n'autorise rien. Seul le tableau de bord Hangfire (<see cref="DashboardPath"/>) sert du
/// HTML ; ses scripts et feuilles de style viennent de <c>/jobs</c> lui-même, aucun script en ligne
/// (vérifié sur Hangfire 1.8.25), mais des attributs <c>style</c> : d'où <c>'unsafe-inline'</c> pour
/// les styles uniquement.
/// </summary>
public static class SecurityHeaders
{
    public const string DashboardPath = "/jobs";

    public const string ApiContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";

    public const string DashboardContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        + "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

    public static IApplicationBuilder UseInSecondsSecurityHeaders(this IApplicationBuilder app) =>
        app.Use((httpContext, next) =>
        {
            // Chemin lu à l'entrée : le tableau de bord Hangfire le déplace ensuite dans PathBase.
            var isDashboard = IsDashboard(httpContext.Request.Path);
            // Posés au démarrage de la réponse : ils couvrent aussi les erreurs écrites plus loin.
            httpContext.Response.OnStarting(() =>
            {
                Apply(httpContext.Response.Headers, isDashboard);
                return Task.CompletedTask;
            });
            return next(httpContext);
        });

    internal static bool IsDashboard(PathString path) => path.StartsWithSegments(DashboardPath);

    internal static void Apply(IHeaderDictionary headers, bool isDashboard)
    {
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        headers["Referrer-Policy"] = "no-referrer";
        // Derrière Cloudflare et Caddy, toujours en HTTPS ; sans includeSubDomains (dev.inseconds.cc
        // et les autres sous-domaines se gèrent à part).
        headers.StrictTransportSecurity = "max-age=31536000";
        headers.ContentSecurityPolicy = isDashboard
            ? DashboardContentSecurityPolicy
            : ApiContentSecurityPolicy;
    }
}
