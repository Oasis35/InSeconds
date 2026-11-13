using System.Globalization;
using System.Text;
using System.Xml.Linq;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

public static class SitemapEndpoint
{
    private static readonly XNamespace Ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

    /// <summary>Les pages fixes du front, toujours en tête du plan.</summary>
    private static readonly string[] FixedPages = ["/daily", "/legal", "/privacy"];

    /// <summary>La page du jeu change chaque jour : elle seule, parmi les pages fixes, porte une date de modification.</summary>
    private const string DailyPage = "/daily";

    /// <summary>
    /// Le plan du site pour les moteurs de recherche : les pages fixes, puis un jour passé publié par ligne, du plus récent au plus ancien.
    /// <c>lastmod</c> d'un jour passé : la date de calcul de sa photo figée (<c>daily-close-day</c> à J+2, ou un recalcul de l'admin),
    /// aujourd'hui tant qu'il est calculé en direct.
    /// </summary>
    public static string Build(AppOptions app, IReadOnlyList<DateOnly> published, IReadOnlyDictionary<DateOnly, DateTimeOffset> frozenAt, DateOnly today)
    {
        var urls = FixedPages.Select(p => Url(app.Link(p), p == DailyPage ? today : null))
            .Concat(published.Select(d => Url(
                app.Link("/history/daily/" + d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                frozenAt.TryGetValue(d, out var computedAt) ? DateOnly.FromDateTime(computedAt.UtcDateTime) : today)));
        var document = new XDocument(new XDeclaration("1.0", "UTF-8", null), new XElement(Ns + "urlset", urls));
        return document.Declaration + "\n" + document.Root!.ToString(SaveOptions.DisableFormatting);
    }

    private static XElement Url(string loc, DateOnly? lastModified) =>
        new(Ns + "url",
            new XElement(Ns + "loc", loc),
            lastModified is { } date ? new XElement(Ns + "lastmod", date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)) : null);

    /// <summary>
    /// <c>GET /sitemap.xml</c> : public, mis en cache une heure. Servi par l'API (Caddy y envoie <c>/sitemap.xml</c> du domaine du front) : la
    /// liste des jours publiés change chaque nuit. Les adresses sont celles du front (<c>App:PublicUrl</c>).
    /// </summary>
    [WolverineGet("/sitemap.xml", OperationId = "getSitemap")]
    [EnableRateLimiting(RateLimitPolicies.DailyArchive)]
    public static async Task Get(IDailyStatsQueries stats, IGameCalendar calendar, IOptions<AppOptions> app, HttpResponse response, CancellationToken ct)
    {
        var xml = Encoding.UTF8.GetBytes(Build(
            app.Value, await ChallengeArchive.PublishedDatesAsync(stats, calendar, ct), await stats.GetSnapshotDatesAsync(ct), calendar.Today));
        response.ContentType = "application/xml; charset=utf-8";
        response.ContentLength = xml.Length;
        response.Headers.CacheControl = "public, max-age=3600";
        await response.Body.WriteAsync(xml, ct);
    }

    /// <summary>
    /// <c>HEAD /sitemap.xml</c> : les en-têtes du <c>GET</c>, longueur comprise ; Kestrel ne transmet pas le corps d'une réponse à un
    /// <c>HEAD</c>. Certains robots et validateurs vérifient l'adresse ainsi avant de la lire : une route <c>GET</c> seule leur répondait 405.
    /// </summary>
    [WolverineHead("/sitemap.xml", OperationId = "headSitemap")]
    [EnableRateLimiting(RateLimitPolicies.DailyArchive)]
    public static Task Head(IDailyStatsQueries stats, IGameCalendar calendar, IOptions<AppOptions> app, HttpResponse response, CancellationToken ct) =>
        Get(stats, calendar, app, response, ct);
}
