namespace InSeconds.Infrastructure.Http;

/// <summary>
/// Classe grossière d'un appareil, tirée du <c>User-Agent</c> : <see cref="Phone"/>, <see cref="Tablet"/> ou <see cref="Desktop"/>.
/// Trois valeurs fermées, pour que les statistiques de l'admin n'en voient qu'un nombre limité ; l'en-tête brut n'est jamais stocké
/// ni journalisé. Rien de reconnu : pas de classe.
/// </summary>
public static class DeviceClass
{
    public const string Phone = "phone";
    public const string Tablet = "tablet";
    public const string Desktop = "desktop";

    /// <summary>Les valeurs possibles, dans l'ordre d'affichage.</summary>
    public static readonly IReadOnlyList<string> All = [Phone, Tablet, Desktop];

    public const int MaxLength = 10;

    public static string? From(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
            return null;
        if (userAgent.Contains("iPhone", StringComparison.Ordinal))
            return Phone;
        if (userAgent.Contains("iPad", StringComparison.Ordinal))
            return Tablet;
        // Android : « Mobile » dans l'en-tête pour un téléphone, absent pour une tablette.
        if (userAgent.Contains("Android", StringComparison.Ordinal))
            return userAgent.Contains("Mobile", StringComparison.Ordinal) ? Phone : Tablet;
        if (userAgent.Contains("Windows", StringComparison.Ordinal)
            || userAgent.Contains("Macintosh", StringComparison.Ordinal)
            || userAgent.Contains("CrOS", StringComparison.Ordinal)
            || userAgent.Contains("Linux", StringComparison.Ordinal))
            return Desktop;
        return null;
    }
}
