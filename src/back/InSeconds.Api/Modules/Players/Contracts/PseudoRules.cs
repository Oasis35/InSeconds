using System.Text.RegularExpressions;

namespace InSeconds.Api.Modules.Players.Contracts;

/// <summary>
/// Ce qu'un texte libre montré aux autres joueurs (un pseudo, le nom d'un groupe) peut contenir : une liste de caractères permis plutôt qu'une liste
/// de mots interdits. Une seule définition, que Players applique aux pseudos et que les autres modules appliquent à leurs propres noms.
/// </summary>
public static class PseudoRules
{
    /// <summary>Un caractère permis : lettre, chiffre, espace, <c>_</c>, <c>.</c> ou <c>-</c>.</summary>
    public const string AllowedCharacter = @"[\p{L}\p{N} _.-]";

    private static readonly Regex Allowed = new($"^{AllowedCharacter}+$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    /// <summary>L'expression d'un texte de <paramref name="minLength"/> à <paramref name="maxLength"/> caractères permis.</summary>
    public static string Pattern(int minLength, int maxLength) => $"^{AllowedCharacter}{{{minLength},{maxLength}}}$";

    /// <summary>Le texte (sans espace autour) n'a que des caractères permis et sa longueur est dans les bornes.</summary>
    public static bool IsValid(string? text, int minLength, int maxLength) =>
        text?.Trim() is { } trimmed && trimmed.Length >= minLength && trimmed.Length <= maxLength && Allowed.IsMatch(trimmed);
}
