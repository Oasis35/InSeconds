namespace InSeconds.Api.Common.Text;

public sealed class TextNormalizer
{
    private static readonly string[] StopWords =
        ["the", "le", "la", "les", "un", "une", "de", "du", "des", "and", "et", "feat", "ft", "vs"];

    // Tolérance aux fautes de frappe, plafonnée à maxThreshold mais réduite pour les
    // réponses courtes — sinon une chaîne de 2-3 caractères ("U2", "M83") tolère une
    // distance de 2, ce qui revient à accepter presque n'importe quelle autre chaîne de
    // même longueur comme correcte (pas une tolérance à la faute de frappe, un trou de
    // correction). Seuil proportionné à la longueur normalisée attendue (la référence,
    // pas la réponse du joueur — sinon padder la réponse gonflerait la tolérance) :
    // longueur < 3 → 0 (égalité stricte), 3-5 → 1, ≥ 6 → maxThreshold (2 par défaut).
    public bool IsMatch(string? given, string expected, int maxThreshold = 2)
    {
        if (string.IsNullOrWhiteSpace(given))
            return false;

        var normalizedGiven    = Normalize(given);
        var normalizedExpected = Normalize(expected);

        if (normalizedGiven == normalizedExpected)
            return true;

        var threshold = Math.Min(maxThreshold, normalizedExpected.Length / 3);

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
