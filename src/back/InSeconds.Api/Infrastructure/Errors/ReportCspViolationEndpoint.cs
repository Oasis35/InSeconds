using System.Text.Json;
using InSeconds.Infrastructure.Http;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Infrastructure.Errors;

/// <summary>Une violation de la Content-Security-Policy du front, lue dans un rapport envoyé par le navigateur.</summary>
public sealed record CspViolation(
    string? DocumentUrl,
    string? BlockedUrl,
    string? Directive,
    string? Disposition,
    string? SourceFile,
    int? LineNumber);

/// <summary>
/// Lit les deux formats de rapport des navigateurs, sans se fier au <c>Content-Type</c> (chacun l'écrit à sa façon) :
/// la Reporting API (<c>report-to</c>, Chrome, Edge : <c>application/reports+json</c>, un tableau de rapports dont le
/// <c>body</c> est en camelCase) et l'ancien <c>report-uri</c> (Firefox, Safari : <c>application/csp-report</c>, un objet
/// <c>csp-report</c> aux clés en kebab-case).
/// </summary>
public static class CspReportParser
{
    /// <summary>Plafond par requête : un lot de la Reporting API peut en porter beaucoup, on n'en journalise que les premières.</summary>
    public const int MaxViolationsPerRequest = 10;

    /// <summary>Longueur gardée de chaque champ texte : ils viennent du navigateur.</summary>
    internal const int MaxFieldLength = 500;

    /// <summary>
    /// Violations provoquées par une extension du navigateur (le joueur l'a installée, la page n'y peut rien) :
    /// écartées, elles noieraient les vraies.
    /// </summary>
    private static readonly string[] ExtensionSchemes =
        ["chrome-extension:", "moz-extension:", "safari-extension:", "safari-web-extension:", "ms-browser-extension:"];

    public static IReadOnlyList<CspViolation> Parse(ReadOnlyMemory<byte> body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            return Read(document.RootElement)
                .Where(v => !FromExtension(v))
                .Take(MaxViolationsPerRequest)
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IEnumerable<CspViolation> Read(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Array)
        {
            foreach (var report in root.EnumerateArray())
            {
                if (report.ValueKind == JsonValueKind.Object
                    && String(report, "type") == "csp-violation"
                    && report.TryGetProperty("body", out var body)
                    && body.ValueKind == JsonValueKind.Object)
                {
                    yield return new CspViolation(
                        String(body, "documentURL"),
                        String(body, "blockedURL"),
                        String(body, "effectiveDirective"),
                        String(body, "disposition"),
                        String(body, "sourceFile"),
                        Int(body, "lineNumber"));
                }
            }
        }
        else if (root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty("csp-report", out var legacy)
            && legacy.ValueKind == JsonValueKind.Object)
        {
            // Safari n'envoie que violated-directive, qui peut porter la politique entière (« script-src 'self' ») : son premier mot.
            var directive = String(legacy, "effective-directive") ?? String(legacy, "violated-directive")?.Split(' ')[0];
            yield return new CspViolation(
                String(legacy, "document-uri"),
                String(legacy, "blocked-uri"),
                directive,
                String(legacy, "disposition"),
                String(legacy, "source-file"),
                Int(legacy, "line-number"));
        }
    }

    private static bool FromExtension(CspViolation violation) =>
        ExtensionSchemes.Any(scheme =>
            (violation.BlockedUrl?.StartsWith(scheme, StringComparison.OrdinalIgnoreCase) ?? false)
            || (violation.SourceFile?.StartsWith(scheme, StringComparison.OrdinalIgnoreCase) ?? false));

    private static string? String(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
            return null;
        var text = value.GetString();
        if (string.IsNullOrEmpty(text))
            return null;
        return text.Length > MaxFieldLength ? text[..MaxFieldLength] : text;
    }

    private static int? Int(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)
            ? number
            : null;
}

public static class ReportCspViolationEndpoint
{
    /// <summary>Taille maximale d'un rapport lu ; au-delà, il est ignoré.</summary>
    internal const int MaxBodyBytes = 64 * 1024;

    /// <summary>
    /// Rapports de violation de la CSP envoyés par le navigateur lui-même (<c>report-to</c> et <c>report-uri</c> de
    /// <c>nginx/csp.conf.template</c>). Contrairement à l'ancien écouteur Angular, ils couvrent aussi le chargement de
    /// la page, avant le démarrage de l'application (scripts de <c>index.html</c>, injection de Cloudflare).
    /// Public et limité par IP ; le navigateur les envoie sans cookie, donc sans joueur. Journalisé au même format que
    /// les erreurs du front (source <c>csp</c>), pour la tuile « Violations CSP » de Grafana. Toujours 204 : le
    /// navigateur ne lit pas la réponse.
    /// </summary>
    [WolverinePost("/api/csp-reports")]
    [EnableRateLimiting(RateLimitPolicies.CspReport)]
    [ExcludeFromDescription]
    [EmptyResponse]
    public static async Task Post(HttpRequest request, ILogger<CspViolation> logger, CancellationToken cancellationToken)
    {
        var body = await ReadBodyAsync(request.Body, cancellationToken);
        if (body is null)
            return;

        var device = DeviceLabel.From(request.Headers.UserAgent);
        foreach (var violation in CspReportParser.Parse(body.Value))
        {
            ClientErrorLog.ClientError(logger, "csp",
                ReportClientErrorEndpoint.ToSingleLine(PathOf(violation.DocumentUrl), ' '),
                ReportClientErrorEndpoint.ToSingleLine(Describe(violation), ' ')!,
                httpStatus: null, relatedTraceId: null, appVersion: null, online: null, device, clientStack: null);
        }
    }

    /// <summary>Même texte que l'ancien écouteur du front : « CSP (report) script-src-elem bloque https://… depuis https://…:12 ».</summary>
    internal static string Describe(CspViolation violation)
    {
        var mode = violation.Disposition == "report" ? "report" : "enforce";
        var blocked = ReportClientErrorEndpoint.WithoutQuery(violation.BlockedUrl) ?? "inconnu";
        var source = violation.SourceFile is null
            ? ""
            : $" depuis {ReportClientErrorEndpoint.WithoutQuery(violation.SourceFile)}:{violation.LineNumber}";
        return $"CSP ({mode}) {violation.Directive ?? "inconnue"} bloque {blocked}{source}";
    }

    /// <summary>Le chemin de la page seulement (« /daily »), comme les erreurs du front : ni domaine, ni query string, ni fragment.</summary>
    internal static string? PathOf(string? documentUrl)
    {
        if (documentUrl is null)
            return null;
        return Uri.TryCreate(documentUrl, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
            ? uri.AbsolutePath
            : ReportClientErrorEndpoint.WithoutQuery(documentUrl);
    }

    private static async Task<ReadOnlyMemory<byte>?> ReadBodyAsync(Stream body, CancellationToken cancellationToken)
    {
        var buffer = new byte[MaxBodyBytes + 1];
        var total = 0;
        int read;
        while (total < buffer.Length && (read = await body.ReadAsync(buffer.AsMemory(total), cancellationToken)) > 0)
            total += read;
        return total == 0 || total > MaxBodyBytes ? null : buffer.AsMemory(0, total);
    }
}
