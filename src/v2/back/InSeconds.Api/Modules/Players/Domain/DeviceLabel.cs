namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Libellé grossier d'un appareil pour la liste du profil (§ 4.2 du plan v2) : navigateur et système,
/// tirés du <c>User-Agent</c> à l'ouverture de la session. L'en-tête brut n'est jamais stocké, ni
/// l'adresse IP. Sans langue (« Chrome · Android ») : le front l'affiche tel quel en français comme
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
