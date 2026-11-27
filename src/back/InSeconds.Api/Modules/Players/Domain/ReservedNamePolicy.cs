using System.Globalization;
using System.Text;

namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// La règle des noms réservés, pure (aucune dépendance) : trois listes de termes, trois façons de les chercher dans un nom.
/// <list type="bullet">
/// <item><b>Contient</b> : le terme se trouve dans le nom collé (« TeamInSeconds », « In Seconds », « inseconds.cc »). Pour les marques et les mots
/// longs, peu courants.</item>
/// <item><b>Mot</b> : un des mots du nom est le terme (« Admin Club », « SuperAdmin »), pas un mot qui le contient (« Badminton »).</item>
/// <item><b>Égal</b> : le nom entier est le terme, avec des chiffres derrière (« Team », « Team2 », mais pas « Team Dupont »). Pour les mots courants.</item>
/// </list>
/// Avant toute comparaison, le nom est ramené à des mots (ponctuation et espaces séparent, une majuscule après une minuscule aussi), sans casse ni
/// accents, avec les lettres répétées réduites à une (« adminnn ») et les chiffres lus aussi comme des lettres (« 4dm1n », « 1nSeconds »).
/// </summary>
public sealed class ReservedNamePolicy
{
    // Chiffres lus comme des lettres, et quelques lettres cyrilliques identiques à des lettres latines.
    private static readonly Dictionary<char, char> LookAlikes = new()
    {
        ['0'] = 'o',
        ['1'] = 'i',
        ['3'] = 'e',
        ['4'] = 'a',
        ['5'] = 's',
        ['7'] = 't',
        ['а'] = 'a',
        ['е'] = 'e',
        ['о'] = 'o',
        ['р'] = 'p',
        ['с'] = 'c',
        ['х'] = 'x',
        ['у'] = 'y',
        ['і'] = 'i',
        ['ѕ'] = 's',
    };

    private readonly string[] _contains;
    private readonly HashSet<string> _words;
    private readonly HashSet<string> _exact;

    public ReservedNamePolicy(IEnumerable<string> contains, IEnumerable<string> words, IEnumerable<string> exact)
    {
        _contains = [.. Terms(contains)];
        _words = [.. Terms(words)];
        _exact = [.. Terms(exact)];
    }

    public bool IsReserved(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return false;
        var words = Split(name);
        if (words.Count == 0)
            return false;

        var joined = string.Concat(words);
        var joinedPlain = Collapse(joined);
        var joinedLookAlike = Collapse(Fold(joined));
        if (_contains.Any(t => joinedPlain.Contains(t, StringComparison.Ordinal) || joinedLookAlike.Contains(t, StringComparison.Ordinal)))
            return true;
        if (words.Any(w => Matches(_words, w)))
            return true;
        return Matches(_exact, joined);
    }

    /// <summary>Le mot, sans ses chiffres de fin (« team2 ») ou avec ses chiffres lus comme des lettres (« t3am »), est-il un des termes ?</summary>
    private static bool Matches(HashSet<string> terms, string word)
    {
        var withoutDigits = Collapse(word.TrimEnd('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'));
        return (withoutDigits.Length > 0 && terms.Contains(withoutDigits)) || terms.Contains(Collapse(Fold(word)));
    }

    private static IEnumerable<string> Terms(IEnumerable<string> raw) =>
        raw.Select(t => Collapse(string.Concat(Split(t)))).Where(t => t.Length > 0).Distinct(StringComparer.Ordinal);

    /// <summary>Les mots du texte, en minuscules et sans accents : tout ce qui n'est ni lettre ni chiffre les sépare, et une majuscule après une minuscule en ouvre un autre.</summary>
    private static List<string> Split(string text)
    {
        var words = new List<string>();
        var current = new StringBuilder();
        var previousLower = false;
        foreach (var c in text.Normalize(NormalizationForm.FormD))
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category == UnicodeCategory.NonSpacingMark)
                continue;
            if (!char.IsLetterOrDigit(c))
            {
                Flush(words, current);
                previousLower = false;
                continue;
            }

            if (char.IsUpper(c) && previousLower)
                Flush(words, current);
            current.Append(char.ToLowerInvariant(c));
            previousLower = char.IsLower(c);
        }

        Flush(words, current);
        return words;
    }

    private static void Flush(List<string> words, StringBuilder current)
    {
        if (current.Length == 0)
            return;
        words.Add(current.ToString());
        current.Clear();
    }

    private static string Fold(string text)
    {
        var chars = text.ToCharArray();
        for (var i = 0; i < chars.Length; i++)
            if (LookAlikes.TryGetValue(chars[i], out var letter))
                chars[i] = letter;
        return new string(chars);
    }

    /// <summary>Une lettre répétée vaut une lettre (« adminnn » devient « admin »).</summary>
    private static string Collapse(string text)
    {
        var builder = new StringBuilder(text.Length);
        foreach (var c in text)
            if (builder.Length == 0 || builder[^1] != c)
                builder.Append(c);
        return builder.ToString();
    }
}

/// <summary>Les termes réservés de départ, quand aucun réglage ne les remplace. Sans accents, ponctuation ni espaces : la comparaison les retire.</summary>
public static class ReservedNameDefaults
{
    /// <summary>Marques et mots longs : refusés dès qu'ils sont dans le nom.</summary>
    public static readonly string[] Contains =
    [
        "inseconds",
        "administrateur", "administrator", "moderateur", "moderator", "sysadmin", "webmaster",
        "serviceclient", "customerservice", "helpdesk",
        "deezer", "spotify", "soundcloud", "bandcamp", "qobuz", "napster", "shazam", "youtube", "ytmusic", "applemusic", "itunes", "amazonmusic",
        "musicbrainz", "cloudflare",
    ];

    /// <summary>Rôles et titres : refusés comme mot du nom (« Admin Club »), pas dans un mot plus long (« Badminton »).</summary>
    public static readonly string[] Words =
    [
        "insecond", "inseconde",
        "admin", "modo", "staff", "owner", "fondateur", "founder", "proprietaire",
        "support", "assistance",
        "officiel", "official", "certifie", "verifie", "verified",
        "claude", "anthropic", "genius",
    ];

    /// <summary>Mots courants : refusés seulement quand ils sont tout le nom (avec des chiffres derrière).</summary>
    public static readonly string[] Exact =
    [
        "equipe", "team", "crew", "aide", "help", "info", "infos", "contact", "systeme", "system", "root", "bot", "null", "undefined", "test",
        "anonyme", "anonymous", "invite", "guest", "classement", "ranking", "general", "defi", "daily",
        "survie", "hits", "moderation",
        "tidal", "apple", "amazon", "google", "pandora", "vevo", "twitch", "tiktok", "instagram", "facebook", "snapchat", "discord", "reddit",
    ];
}
