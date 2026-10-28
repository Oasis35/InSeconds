namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// D'où vient un invité : le <c>utm_source</c> de son lien d'arrivée (<c>instagram</c>, <c>share</c>…) ou le domaine du site qui l'a
/// envoyé (<c>google.com</c>), lu par le front. Une valeur au format strict, pour que la télémétrie n'en voie qu'un nombre limité et
/// qu'aucun texte libre n'arrive en base : minuscules, lettres, chiffres, <c>.</c> <c>-</c> <c>_</c>, <see cref="MaxLength"/> caractères
/// au plus. Le reste devient <see cref="Other"/>, une source absente <see cref="Direct"/>.
/// </summary>
public static class AcquisitionSource
{
    public const int MaxLength = 40;
    public const string Direct = "direct";
    public const string Other = "other";

    public static string Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return Direct;
        var source = raw.Trim().ToLowerInvariant();
        return source.Length <= MaxLength && source.All(IsAllowed) ? source : Other;
    }

    private static bool IsAllowed(char c) => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c is '.' or '-' or '_';
}
