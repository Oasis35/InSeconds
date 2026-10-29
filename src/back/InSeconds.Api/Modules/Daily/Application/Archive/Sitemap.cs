using System.Globalization;
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

    /// <summary>Le plan du site pour les moteurs de recherche : les pages fixes, puis un jour passé publié par ligne, du plus récent au plus ancien.</summary>
    public static string Build(AppOptions app, IReadOnlyList<DateOnly> published)
    {
        var urls = FixedPages.Select(p => new XElement(Ns + "url", new XElement(Ns + "loc", app.Link(p))))
            .Concat(published.Select(d => new XElement(Ns + "url",
                new XElement(Ns + "loc", app.Link("/daily/archive/" + d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))))));
        var document = new XDocument(new XDeclaration("1.0", "UTF-8", null), new XElement(Ns + "urlset", urls));
        return document.Declaration + "\n" + document.Root!.ToString(SaveOptions.DisableFormatting);
    }

    /// <summary>
    /// <c>GET /sitemap.xml</c> : public, mis en cache une heure. Servi par l'API (Caddy y envoie <c>/sitemap.xml</c> du domaine du front) : la
    /// liste des jours publiés change chaque nuit. Les adresses sont celles du front (<c>App:PublicUrl</c>).
    /// </summary>
    [WolverineGet("/sitemap.xml", OperationId = "getSitemap")]
    [EnableRateLimiting(RateLimitPolicies.DailyArchive)]
    public static async Task Get(IDailyStatsQueries stats, IGameCalendar calendar, IOptions<AppOptions> app, HttpResponse response, CancellationToken ct)
    {
        var xml = Build(app.Value, await ChallengeArchive.PublishedDatesAsync(stats, calendar, ct));
        response.ContentType = "application/xml; charset=utf-8";
        response.Headers.CacheControl = "public, max-age=3600";
        await response.WriteAsync(xml, ct);
    }
}
