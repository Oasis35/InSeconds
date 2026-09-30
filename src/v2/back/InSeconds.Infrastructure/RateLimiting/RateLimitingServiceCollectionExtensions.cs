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
    /// <summary>Limites par IP réelle (voir <c>TrustedProxyNetworks</c>), les mêmes qu'en v1.</summary>
    internal static readonly IReadOnlyDictionary<string, (int PermitLimit, TimeSpan Window)> Limits =
        new Dictionary<string, (int, TimeSpan)>
        {
            // Le délai de 60 s par adresse n'empêche pas d'écrire à une victime chaque minute,
            // ni de solliciter Brevo en masse sur des adresses différentes.
            [RateLimitPolicies.MagicLinkRequest] = (5, TimeSpan.FromMinutes(10)),
            [RateLimitPolicies.EmailChangeRequest] = (5, TimeSpan.FromMinutes(10)),
            // Généreux : un vrai joueur qui recharge ou relance plusieurs fois n'est jamais gêné.
            [RateLimitPolicies.PlayerCreation] = (30, TimeSpan.FromMinutes(10)),
            // Le front plafonne déjà ses envois par page.
            [RateLimitPolicies.ClientErrorReport] = (20, TimeSpan.FromMinutes(5)),
            // L'autocomplétion envoie plusieurs requêtes par recherche, parfois derrière un NAT partagé.
            [RateLimitPolicies.CatalogueSearch] = (60, TimeSpan.FromMinutes(5)),
        };

    public static IServiceCollection AddInSecondsRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(RateLimitingOptions.Section).Get<RateLimitingOptions>() ?? new();

        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.OnRejected = WriteProblemAsync;

            foreach (var (policy, limit) in Limits)
                limiter.AddPolicy(policy, httpContext => options.Enabled
                    ? RateLimitPartition.GetSlidingWindowLimiter(ClientIp(httpContext), _ => new SlidingWindowRateLimiterOptions
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
