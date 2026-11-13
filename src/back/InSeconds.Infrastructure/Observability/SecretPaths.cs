namespace InSeconds.Infrastructure.Observability;

/// <summary>
/// Les chemins dont un segment est un secret de lien (le code d'invitation d'un groupe, le code d'une playlist) : ce segment est remplacé par
/// <c>{code}</c> avant d'entrer dans une trace ou un journal, sinon un code lu dans Grafana suffirait à rejoindre le groupe. L'API donne les préfixes
/// (ce projet ne connaît pas ses routes) ; le segment masqué est celui qui suit le préfixe.
/// </summary>
public sealed class SecretPaths(IEnumerable<string> prefixes)
{
    public const string Placeholder = "{code}";

    private readonly string[] _prefixes = [.. prefixes.Select(prefix => prefix.TrimEnd('/') + "/")];

    /// <summary>Les sous-chemins qui ne sont pas des codes (« /setlist/history »), laissés tels quels.</summary>
    public IReadOnlySet<string> Keep { get; init; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    public string? Mask(string? path)
    {
        if (string.IsNullOrEmpty(path))
            return path;
        foreach (var prefix in _prefixes)
        {
            if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || path.Length == prefix.Length)
                continue;
            var rest = path[prefix.Length..];
            var end = rest.IndexOf('/');
            var segment = end < 0 ? rest : rest[..end];
            if (segment.Length == 0 || Keep.Contains(segment))
                continue;
            return prefix + Placeholder + (end < 0 ? "" : rest[end..]);
        }
        return path;
    }
}
