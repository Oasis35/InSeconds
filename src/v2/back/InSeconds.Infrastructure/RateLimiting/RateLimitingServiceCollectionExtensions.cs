using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Infrastructure.RateLimiting;

public sealed class RateLimitingOptions
{
    public const string Section = "RateLimiting";

    /// <summary>
    /// <c>false</c> en test (configuration de l'environnement <c>Testing</c>) : les politiques restent
    /// déclarées sur les routes, mais ne limitent plus rien. Jamais de condition dans le code.
    /// </summary>
    public bool Enabled { get; set; } = true;
}

public static class RateLimitingServiceCollectionExtensions
{
    /// <summary>
    /// Limites par IP réelle (voir <c>TrustedProxyNetworks</c>), les mêmes qu'en v1, ou par joueur pour les
    /// routes d'un joueur identifié (S11 : changement d'email, révocation d'appareils).
    /// </summary>
    internal static readonly IReadOnlyDictionary<string, (int PermitLimit, TimeSpan Window, PartitionBy By)> Limits =
        new Dictionary<string, (int, TimeSpan, PartitionBy)>
        {
            // Le délai de 60 s par adresse n'empêche pas d'écrire à une victime chaque minute,
            // ni de solliciter Brevo en masse sur des adresses différentes.
            [RateLimitPolicies.MagicLinkRequest] = (5, TimeSpan.FromMinutes(10), PartitionBy.Ip),
            [RateLimitPolicies.EmailChangeRequest] = (5, TimeSpan.FromMinutes(10), PartitionBy.Player),
            // Large : un joueur qui fait le ménage dans ses appareils n'est jamais gêné.
            [RateLimitPolicies.DeviceRevocation] = (20, TimeSpan.FromMinutes(10), PartitionBy.Player),
            // Généreux : un vrai joueur qui recharge ou relance plusieurs fois n'est jamais gêné.
            [RateLimitPolicies.PlayerCreation] = (30, TimeSpan.FromMinutes(10), PartitionBy.Ip),
            // Le front plafonne déjà ses envois par page.
            [RateLimitPolicies.ClientErrorReport] = (20, TimeSpan.FromMinutes(5), PartitionBy.Ip),
            // L'autocomplétion envoie plusieurs requêtes par recherche, parfois derrière un NAT partagé.
            [RateLimitPolicies.CatalogueSearch] = (60, TimeSpan.FromMinutes(5), PartitionBy.Ip),
        };

    /// <param name="playerKey">
    /// Identifiant du joueur de la requête, pour les limites par joueur (l'API seule connaît ses claims).
    /// Sans joueur identifié, ces limites retombent sur l'IP.
    /// </param>
    public static IServiceCollection AddInSecondsRateLimiting(
        this IServiceCollection services, IConfiguration configuration, Func<HttpContext, string?>? playerKey = null)
    {
        var options = configuration.GetSection(RateLimitingOptions.Section).Get<RateLimitingOptions>() ?? new();

        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.OnRejected = WriteProblemAsync;

            foreach (var (policy, limit) in Limits)
                limiter.AddPolicy(policy, httpContext => options.Enabled
                    ? RateLimitPartition.GetSlidingWindowLimiter(PartitionKey(httpContext, limit.By, playerKey), _ => new SlidingWindowRateLimiterOptions
                    {
                        PermitLimit = limit.PermitLimit,
                        Window = limit.Window,
                        SegmentsPerWindow = 5,
                        QueueLimit = 0,
                    })
                    : RateLimitPartition.GetNoLimiter(string.Empty));
        });
        return services;
    }

    internal static string PartitionKey(HttpContext httpContext, PartitionBy by, Func<HttpContext, string?>? playerKey) =>
        by == PartitionBy.Player && playerKey?.Invoke(httpContext) is { } player
            ? "player:" + player
            : "ip:" + ClientIp(httpContext);

    /// <summary>IP du joueur, une fois <c>X-Forwarded-For</c> déroulé par <c>UseForwardedHeaders</c>.</summary>
    internal static string ClientIp(HttpContext httpContext) =>
        httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    /// <summary>Un 429 au même format que les autres erreurs (ProblemDetails, code et traceId).</summary>
    private static async ValueTask WriteProblemAsync(OnRejectedContext context, CancellationToken ct)
    {
        var httpContext = context.HttpContext;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            httpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);

        var problems = httpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
        await problems.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = { Status = StatusCodes.Status429TooManyRequests },
        });
    }
}

/// <summary>Ce que compte une limite : les requêtes d'une IP, ou celles d'un joueur.</summary>
internal enum PartitionBy
{
    Ip,
    Player,
}
