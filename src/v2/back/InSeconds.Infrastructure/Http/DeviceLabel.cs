namespace InSeconds.Infrastructure.Http;

/// <summary>
/// Libellé grossier d'un appareil, tiré du <c>User-Agent</c> : navigateur et système (« Chrome · Android »).
/// Utilisé pour la liste des appareils du profil (§ 4.2 du plan v2, calculé à l'ouverture de la session)
/// et dans le journal des erreurs front (<c>POST /api/client-errors</c>). L'en-tête brut n'est jamais
/// stocké ni journalisé, ni l'adresse IP. Sans langue : le front l'affiche tel quel en français comme
/// en anglais. Rien de reconnu : pas de libellé.
/// </summary>
public static class DeviceLabel
{
    // L'ordre compte : un User-Agent cite plusieurs moteurs (Edge contient « Chrome » et « Safari »).
    private static readonly (string Marker, string Name)[] Browsers =
    [
        ("Edg/", "Edge"),
        ("EdgiOS", "Edge"),
        ("OPR/", "Opera"),
        ("SamsungBrowser", "Samsung Internet"),
        ("Firefox/", "Firefox"),
        ("FxiOS", "Firefox"),
        ("CriOS", "Chrome"),
        ("Chrome/", "Chrome"),
        ("Safari/", "Safari"),
    ];

    private static readonly (string Marker, string Name)[] Systems =
    [
        ("iPhone", "iPhone"),
        ("iPad", "iPad"),
        ("Android", "Android"),
        ("Windows", "Windows"),
        ("CrOS", "ChromeOS"),
        ("Macintosh", "macOS"),
        ("Linux", "Linux"),
    ];

    public static string? From(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
            return null;

        var browser = Find(Browsers, userAgent);
        var system = Find(Systems, userAgent);
        return (browser, system) switch
        {
            (null, null) => null,
            ({ } b, null) => b,
            (null, { } s) => s,
            ({ } b, { } s) => $"{b} · {s}",
        };
    }

    private static string? Find((string Marker, string Name)[] candidates, string userAgent) =>
        candidates.FirstOrDefault(c => userAgent.Contains(c.Marker, StringComparison.Ordinal)).Name;
}
