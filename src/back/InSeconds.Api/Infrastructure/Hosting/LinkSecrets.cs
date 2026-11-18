using InSeconds.Infrastructure.Observability;

namespace InSeconds.Api.Infrastructure.Hosting;

/// <summary>
/// Les chemins qui portent un code de lien (invitation d'un groupe, playlist d'un ami) : celles de l'API pour les traces, celles du front pour les
/// erreurs et les rapports CSP qu'il remonte. Le code est masqué avant d'entrer dans une trace ou un journal.
/// </summary>
public static class LinkSecrets
{
    public static readonly SecretPaths Paths = new(["/api/social/invitations", "/api/runs/challenges", "/ranking/join", "/setlist", "/runs"])
    {
        Keep = new HashSet<string>(["history", "hits"], StringComparer.OrdinalIgnoreCase),
    };
}
