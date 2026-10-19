using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Gameplay.Domain;

/// <summary>
/// La correction des réponses, reprise de la v1 (§ 5.3 du plan v2, remplace <c>TextNormalizer</c>) : insensible à
/// la casse, aux accents, aux parenthèses et crochets (« (feat. X) », « [Radio Edit] »), à la ponctuation et à
/// quelques mots vides (« the », « le », « feat »…), puis tolérante aux fautes de frappe (distance de Levenshtein).
/// </summary>
public sealed partial class FuzzyAnswerMatcher : IAnswerMatcher
{
    /// <summary>Distance de Levenshtein tolérée au plus, quelle que soit la longueur de la réponse attendue.</summary>
    public const int DefaultMaxTypos = 2;

    /// <summary>
    /// Longueur au-delà de laquelle une saisie est refusée sans être lue. Un artiste fait 200 caractères au plus
    /// et un titre 300 (limites de l'API) : une saisie de plus du double n'est pas une tentative de réponse.
    /// </summary>
    public const int MaxInputLength = 600;

    private static readonly HashSet<string> StopWords =
        ["the", "le", "la", "les", "un", "une", "de", "du", "des", "and", "et", "feat", "ft", "vs"];

    private readonly int _maxTypos;

    public FuzzyAnswerMatcher() : this(DefaultMaxTypos)
    {
    }

    public FuzzyAnswerMatcher(int maxTypos)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(maxTypos);
        _maxTypos = maxTypos;
    }

    /// <summary>
    /// La tolérance est proportionnée à la longueur de la réponse **attendue** (la référence, pas la saisie : on
    /// gonflerait la tolérance en allongeant la saisie) : moins de 3 caractères, égalité stricte ; de 3 à 5, une
    /// faute ; au-delà, jusqu'à <see cref="DefaultMaxTypos"/>. Sans cela, « U2 » ou « M83 » accepteraient presque
    /// n'importe quelle autre chaîne de même longueur.
    /// </summary>
    public bool IsMatch(string? given, string expected)
    {
        ArgumentNullException.ThrowIfNull(expected);
        // Une saisie démesurée n'est pas une réponse (le champ en limite la longueur) : on ne la traite pas,
        // elle coûterait cher (la détection des parenthèses relit la chaîne à chaque « ( » non fermée).
        if (string.IsNullOrWhiteSpace(given) || given.Length > MaxInputLength)
            return false;

        var normalizedGiven = Normalize(given);
        var normalizedExpected = Normalize(expected);
        if (normalizedGiven == normalizedExpected)
            return true;

        var threshold = Math.Min(_maxTypos, normalizedExpected.Length / 3);
        // La distance est au moins l'écart de longueur : inutile de la calculer au-delà du seuil.
        if (Math.Abs(normalizedGiven.Length - normalizedExpected.Length) > threshold)
            return false;

        return LevenshteinDistance(normalizedGiven, normalizedExpected) <= threshold;
    }

    [GeneratedRegex(@"[\(\[].*?[\)\]]")]
    private static partial Regex Parentheses();

    private static string Normalize(string input)
    {
        var withoutParentheses = Parentheses().Replace(input, " ");
        var withoutAccents = RemoveAccents(withoutParentheses.ToLowerInvariant());
        var cleaned = new string(withoutAccents.Where(c => char.IsLetterOrDigit(c) || c == ' ').ToArray());
        var words = cleaned.Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(word => !StopWords.Contains(word));
        return string.Join(' ', words);
    }

    private static string RemoveAccents(string input)
    {
        var decomposed = input.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                builder.Append(c);
        }

        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    private static int LevenshteinDistance(string a, string b)
    {
        if (a.Length == 0) return b.Length;
        if (b.Length == 0) return a.Length;

        // Deux lignes suffisent : on ne garde que la précédente.
        var previous = new int[b.Length + 1];
        var current = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++) previous[j] = j;

        for (var i = 1; i <= a.Length; i++)
        {
            current[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                current[j] = Math.Min(Math.Min(previous[j] + 1, current[j - 1] + 1), previous[j - 1] + cost);
            }

            (previous, current) = (current, previous);
        }

        return previous[b.Length];
    }
}
