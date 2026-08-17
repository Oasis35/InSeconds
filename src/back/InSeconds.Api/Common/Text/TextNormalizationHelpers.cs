using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace InSeconds.Api.Common.Text;

internal static partial class TextNormalizationHelpers
{
    [GeneratedRegex(@"[\(\[].*?[\)\]]")]
    internal static partial Regex ParenthesesPattern();

    internal static string RemoveAccents(string input)
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

    // Retire les parenthèses/crochets d'un titre pour l'affichage (ex: "Titre (Radio Edit)" →
    // "Titre"). Réutilisé partout où un titre de morceau est montré au joueur ou à l'admin
    // (autocomplete, réponse révélée, récap, écran "déjà joué", stats admin des défis) — ne
    // touche jamais Track.Title en base, qui reste brut (nécessaire pour le re-sync Deezer).
    internal static string CleanDisplayTitle(string title)
    {
        var cleaned = ParenthesesPattern().Replace(title, "");
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();

        // Titre entièrement entre parenthèses (rare) : garder l'original plutôt qu'une chaîne vide.
        return cleaned.Length == 0 ? title : cleaned;
    }

    internal static int LevenshteinDistance(string a, string b)
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
