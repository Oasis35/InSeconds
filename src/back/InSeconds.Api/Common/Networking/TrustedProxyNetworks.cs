using System.Net;

namespace InSeconds.Api.Common.Networking;

// Plages IP à déclarer comme proxies de confiance pour ForwardedHeadersOptions.KnownIPNetworks
// (cf. Program.cs). Deux sauts à valider entre le vrai client et l'API :
//   Client -> Cloudflare (edge) -> Caddy (VPS, réseau Docker interne) -> API
// Sans ça, KnownIPNetworks vide fait confiance sans condition au premier saut (Caddy) ET
// s'arrête là (ForwardLimit=1 par défaut) : Connection.RemoteIpAddress finit sur l'IP du edge
// Cloudflare, pas sur celle du vrai visiteur — un seul edge Cloudflare dessert des milliers de
// visiteurs distincts, qui se retrouvent tous compactés dans le même compartiment de rate
// limiting (cf. piège 27 racine : verrouillage admin par un 429 déguisé en "mot de passe
// incorrect" côté front, qui affiche le même message générique pour toute erreur HTTP).
public static class TrustedProxyNetworks
{
    // Docker n'alloue jamais d'IP publique à un réseau bridge — un paquet dont la source
    // TCP réelle (vérifiée par le noyau, non falsifiable via un en-tête HTTP) tombe dans ces
    // plages ne peut provenir que de l'intérieur de l'hôte. Couvre le conteneur Caddy quelle
    // que soit la IP que Docker lui attribue (cf. commentaire Program.cs : "pas figée").
    private static readonly (string Network, int PrefixLength)[] PrivateNetworks =
    [
        ("127.0.0.0", 8),
        ("10.0.0.0", 8),
        ("172.16.0.0", 12),
        ("192.168.0.0", 16),
        ("::1", 128),
    ];

    // Plages officielles Cloudflare (https://www.cloudflare.com/ips/) — à revérifier
    // périodiquement, Cloudflare les fait évoluer occasionnellement (rare). Nécessaires pour
    // valider le deuxième saut (edge Cloudflare) et ainsi pouvoir continuer à dérouler
    // X-Forwarded-For jusqu'à la vraie IP cliente que Cloudflare y a inscrite.
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

    public static IEnumerable<IPNetwork> All =>
        PrivateNetworks.Concat(CloudflareNetworks)
            .Select(n => new IPNetwork(IPAddress.Parse(n.Network), n.PrefixLength));
}
