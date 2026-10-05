using System.Text.RegularExpressions;

namespace InSeconds.Api.Modules.Catalogue.Contracts;

/// <summary>Le titre d'un morceau tel qu'on le montre au joueur (§ 5.4 du plan v2).</summary>
public static partial class TrackTitles
{
    [GeneratedRegex(@"[\(\[].*?[\)\]]")]
    private static partial Regex Parentheses();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>
    /// Retire les parenthèses et les crochets (« Titre (Radio Edit) » devient « Titre ») et les espaces en
    /// double qui en résultent. Un titre entièrement entre parenthèses est gardé tel quel plutôt que rendu
    /// vide. Réutilisé partout où un titre est montré (autocomplétion, réponse révélée, récap, stats) ; ne
    /// modifie jamais <c>Track.Title</c>, qui reste le nom de Deezer.
    /// </summary>
    public static string CleanDisplayTitle(string title)
    {
        var cleaned = Whitespace().Replace(Parentheses().Replace(title, ""), " ").Trim();
        return cleaned.Length == 0 ? title : cleaned;
    }
}
