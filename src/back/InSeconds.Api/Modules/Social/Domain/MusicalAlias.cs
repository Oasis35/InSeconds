namespace InSeconds.Api.Modules.Social.Domain;

/// <summary>
/// Les alias musicaux du classement général : un animal ou un objet musical, un adjectif accordé à son genre et un nombre (« Métronome fou 67 »,
/// « Chouette rêveuse 12 »). Les listes sont écrites à la main et relues pour qu'aucune combinaison ne soit blessante : ni animal qui sert d'insulte,
/// ni adjectif qui juge le joueur. Pur : le hasard est fourni par l'appelant, l'unicité (alias déjà pris, pseudo d'un compte) se vérifie en base.
/// </summary>
public static class MusicalAlias
{
    /// <summary>La longueur maximale d'un alias (le plus long nom, le plus long adjectif, trois chiffres et deux espaces tiennent dedans).</summary>
    public const int MaxLength = 40;

    private static readonly string[] Masculine =
    [
        "Métronome", "Hibou", "Oiseau", "Piano", "Violon", "Tambour", "Saxophone", "Merle", "Rossignol", "Pinson", "Renard", "Castor",
        "Flamant", "Ukulélé", "Banjo", "Xylophone", "Hautbois", "Basson", "Triangle", "Diapason", "Vinyle", "Gramophone", "Synthé", "Dauphin",
        "Koala", "Panda", "Lynx", "Colibri", "Grillon", "Tuba", "Violoncelle", "Écureuil", "Pingouin", "Hérisson", "Accordéon", "Cor",
        "Sitar", "Ocarina", "Bongo", "Carillon",
    ];

    private static readonly string[] Feminine =
    [
        "Guitare", "Trompette", "Flûte", "Harpe", "Cigale", "Baleine", "Mésange", "Chouette", "Contrebasse", "Batterie", "Clarinette", "Cymbale",
        "Mandoline", "Cassette", "Loutre", "Fauvette", "Alouette", "Tortue", "Marmotte", "Cornemuse", "Gazelle", "Libellule", "Panthère", "Hirondelle",
        "Mouette", "Luciole", "Coccinelle", "Abeille", "Otarie", "Grenouille", "Lyre", "Timbale", "Kalimba", "Castagnette", "Sirène",
    ];

    /// <summary>Chaque adjectif au masculin et au féminin.</summary>
    private static readonly (string Masculine, string Feminine)[] Adjectives =
    [
        ("fou", "folle"), ("rêveur", "rêveuse"), ("chanteur", "chanteuse"), ("joyeux", "joyeuse"), ("timide", "timide"), ("rapide", "rapide"),
        ("malin", "maligne"), ("discret", "discrète"), ("enjoué", "enjouée"), ("mélodieux", "mélodieuse"), ("rieur", "rieuse"), ("curieux", "curieuse"),
        ("sage", "sage"), ("pressé", "pressée"), ("tranquille", "tranquille"), ("rythmé", "rythmée"), ("endiablé", "endiablée"), ("jazzy", "jazzy"),
        ("groovy", "groovy"), ("funky", "funky"), ("lunaire", "lunaire"), ("cosmique", "cosmique"), ("nocturne", "nocturne"), ("sautillant", "sautillante"),
        ("distrait", "distraite"), ("espiègle", "espiègle"), ("intrépide", "intrépide"), ("électrique", "électrique"), ("acoustique", "acoustique"),
        ("doré", "dorée"), ("brillant", "brillante"), ("agile", "agile"), ("audacieux", "audacieuse"), ("songeur", "songeuse"),
    ];

    /// <summary>Tous les noms, masculins puis féminins (les tests relisent la liste).</summary>
    internal static IReadOnlyList<string> Nouns => [.. Masculine, .. Feminine];

    /// <summary>
    /// <paramref name="count"/> alias tirés au hasard, avec un nombre à <paramref name="digits"/> chiffres (2 d'abord ; 3 si les listes se saturent).
    /// <paramref name="next"/> : un entier de 0 inclus à la borne exclue, comme <see cref="Random.Next(int)"/>.
    /// </summary>
    public static IReadOnlyList<string> Draw(Func<int, int> next, int count, int digits = 2)
    {
        ArgumentNullException.ThrowIfNull(next);
        ArgumentOutOfRangeException.ThrowIfLessThan(digits, 2);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(digits, 3);
        var low = digits == 2 ? 10 : 100;
        var high = digits == 2 ? 100 : 1000;
        var aliases = new List<string>(count);
        for (var i = 0; i < count; i++)
        {
            var feminine = next(Masculine.Length + Feminine.Length) >= Masculine.Length;
            var noun = feminine ? Feminine[next(Feminine.Length)] : Masculine[next(Masculine.Length)];
            var adjective = Adjectives[next(Adjectives.Length)];
            aliases.Add($"{noun} {(feminine ? adjective.Feminine : adjective.Masculine)} {low + next(high - low)}");
        }

        return aliases;
    }

    /// <summary>Le texte a-t-il la forme d'un alias (« Nom adjectif 12 ») ? Pour refuser un alias inventé par le client.</summary>
    public static bool IsWellFormed(string? alias) =>
        !string.IsNullOrWhiteSpace(alias) && alias.Length <= MaxLength
        && alias.Split(' ') is [var noun, var adjective, var number]
        && Nouns.Contains(noun, StringComparer.Ordinal)
        && Adjectives.Any(a => a.Masculine == adjective || a.Feminine == adjective)
        && number.Length is 2 or 3 && number.All(char.IsAsciiDigit) && number[0] != '0';
}
