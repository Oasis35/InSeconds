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

        return TextNormalizationHelpers.LevenshteinDistance(normalizedGiven, normalizedExpected) <= threshold;
    }

    private static string Normalize(string input)
    {
        var withoutParens  = TextNormalizationHelpers.ParenthesesPattern().Replace(input, " ");
        var withoutAccents = TextNormalizationHelpers.RemoveAccents(withoutParens.ToLowerInvariant());

        var cleaned = new string(withoutAccents
            .Where(c => char.IsLetterOrDigit(c) || c == ' ')
            .ToArray());

        var words = cleaned.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(w => !StopWords.Contains(w))
            .ToArray();

        return string.Join(' ', words);
    }
}
