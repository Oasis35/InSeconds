using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Infrastructure.Networking;

/// <summary>
/// Proxies de confiance pour dérouler <c>X-Forwarded-For</c> jusqu'à l'IP réelle du joueur (piège 27
/// du CLAUDE.md racine). En prod, deux sauts : Cloudflare (edge) puis Caddy (réseau Docker interne).
/// Sans ces plages, l'IP vue serait celle d'un edge Cloudflare, partagée par des milliers de
/// visiteurs, et le rate limiting les compterait ensemble. Un appelant qui contourne Cloudflare garde
/// sa vraie IP TCP (hors des deux listes) : il ne peut pas usurper une IP par l'en-tête.
/// </summary>
public static class TrustedProxyNetworks
{
    // Un réseau Docker n'a jamais d'IP publique : une source TCP dans ces plages vient de l'hôte
    // (Caddy, quelle que soit l'IP que Docker lui attribue).
    private static readonly (string Network, int PrefixLength)[] PrivateNetworks =
    [
        ("127.0.0.0", 8),
        ("10.0.0.0", 8),
        ("172.16.0.0", 12),
        ("192.168.0.0", 16),
        ("::1", 128),
    ];

    // Plages publiées par Cloudflare (https://www.cloudflare.com/ips/), à revérifier de temps en
    // temps ; mêmes plages que deploy/caddy/cloudflare-only.sh.
    private static readonly (string Network, int PrefixLength)[] CloudflareNetworks =
    [
        ("173.245.48.0", 20),
        ("103.21.244.0", 22),
        ("103.22.200.0", 22),
        ("103.31.4.0", 22),
        ("141.101.64.0", 18),
        ("108.162.192.0", 18),
        ("190.93.240.0", 20),
        ("188.114.96.0", 20),
        ("197.234.240.0", 22),
        ("198.41.128.0", 17),
        ("162.158.0.0", 15),
        ("104.16.0.0", 13),
        ("104.24.0.0", 14),
        ("172.64.0.0", 13),
        ("131.0.72.0", 22),
        ("2400:cb00::", 32),
        ("2606:4700::", 32),
        ("2803:f800::", 32),
        ("2405:b500::", 32),
        ("2405:8100::", 32),
        ("2a06:98c0::", 29),
        ("2c0f:f248::", 32),
    ];

    public static IEnumerable<System.Net.IPNetwork> All =>
        PrivateNetworks.Concat(CloudflareNetworks)
            .Select(n => new System.Net.IPNetwork(IPAddress.Parse(n.Network), n.PrefixLength));

    public static IServiceCollection AddInSecondsForwardedHeaders(this IServiceCollection services) =>
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // Sans limite de sauts : sûr seulement parce que la confiance est bornée par ces plages.
            options.ForwardLimit = null;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var network in All)
                options.KnownIPNetworks.Add(network);
        });
}
