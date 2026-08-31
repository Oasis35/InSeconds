namespace InSeconds.Api.Common.Auth;

// Anti-CSRF léger : vérifie Origin (ou Referer en repli) contre la liste déjà
// existante Cors:AllowedOrigins — pas de nouvelle config, pas de système de token
// CSRF complet (over-engineering pour cette échelle). Utilisé par VerifyMagicLink
// (point critique : pose un cookie sur la base d'un POST) et par
// LoginEndpoint.IsAdminAuthenticated (défense en profondeur, cf. plan).
public static class OriginValidator
{
    public static bool IsTrustedOrigin(HttpContext ctx, IReadOnlyList<string> allowedOrigins)
    {
        var origin = ctx.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin))
            return allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);

        var referer = ctx.Request.Headers.Referer.ToString();
        if (!string.IsNullOrEmpty(referer))
            return allowedOrigins.Any(o => referer.StartsWith(o, StringComparison.OrdinalIgnoreCase));

        // Ni Origin ni Referer : un appel fetch/XHR légitime envoie toujours l'un des deux.
        return false;
    }
}
