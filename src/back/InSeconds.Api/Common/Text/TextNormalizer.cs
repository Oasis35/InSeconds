using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace InSeconds.Api.Common.Text;

public sealed class TextNormalizer
{
    private static readonly string[] StopWords =
        ["the", "le", "la", "les", "un", "une", "de", "du", "des", "and", "et", "feat", "ft", "vs"];

    public bool IsMatch(string? given, string expected, int threshold = 2)
    {
        if (string.IsNullOrWhiteSpace(given))
            return false;

        var normalizedGiven    = Normalize(given);
        var normalizedExpected = Normalize(expected);

        if (normalizedGiven == normalizedExpected)
            return true;

        return LevenshteinDistance(normalizedGiven, normalizedExpected) <= threshold;
    }

    private static readonly Regex ParenthesesPattern = new(@"[\(\[].*?[\)\]]", RegexOptions.Compiled);

    private static string Normalize(string input)
    {
        // Suppression des parenthèses et crochets avec leur contenu : "(feat. X)", "[Radio Edit]", etc.
        var withoutParens = ParenthesesPattern.Replace(input, " ");

        // Minuscules + suppression accents
        var withoutAccents = RemoveAccents(withoutParens.ToLowerInvariant());

        // Suppression ponctuation et caractères spéciaux (garde les espaces et lettres/chiffres)
        var cleaned = new string(withoutAccents
            .Where(c => char.IsLetterOrDigit(c) || c == ' ')
            .ToArray());

        // Suppression des stop words
        var words = cleaned.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(w => !StopWords.Contains(w))
            .ToArray();

        return string.Join(' ', words);
    }

    private static string RemoveAccents(string input)
    {
        var normalized = input.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();

        foreach (var c in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }

        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    private static int LevenshteinDistance(string a, string b)
    {
        if (a.Length == 0) return b.Length;
        if (b.Length == 0) return a.Length;

        var matrix = new int[a.Length + 1, b.Length + 1];

        for (var i = 0; i <= a.Length; i++) matrix[i, 0] = i;
        for (var j = 0; j <= b.Length; j++) matrix[0, j] = j;

        for (var i = 1; i <= a.Length; i++)
        {
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                matrix[i, j] = Math.Min(
                    Math.Min(matrix[i - 1, j] + 1, matrix[i, j - 1] + 1),
                    matrix[i - 1, j - 1] + cost);
            }
        }

        return matrix[a.Length, b.Length];
    }
}
