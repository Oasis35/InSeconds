using System.Globalization;
using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Gameplay.Domain;

/// <summary>Niveau 1 : l'année de sortie (<c>null</c> si elle n'est pas connue : morceau ajouté avant qu'on la capture).</summary>
public sealed class YearHint : IHintProvider
{
    public int Level => 1;

    public HintKind Kind => HintKind.Year;

    public HintFact Reveal(HintSubject subject)
    {
        ArgumentNullException.ThrowIfNull(subject);
        return new HintFact(HintKind.Year, subject.ReleaseYear?.ToString(CultureInfo.InvariantCulture));
    }
}

/// <summary>
/// Niveau 2 : le nom de l'artiste masqué façon « pendu » : première lettre de chaque mot visible, le reste en
/// <c>_</c> (« Daft Punk » devient « D _ _ _   P _ _ _ »). La ponctuation interne (apostrophe, tiret) reste visible,
/// seuls les lettres et chiffres sont masqués.
/// </summary>
public sealed class HangmanArtistHint : IHintProvider
{
    public int Level => 2;

    public HintKind Kind => HintKind.ArtistMasked;

    public HintFact Reveal(HintSubject subject)
    {
        ArgumentNullException.ThrowIfNull(subject);
        return new HintFact(HintKind.ArtistMasked, Mask(subject.Artist));
    }

    /// <summary>Un nom sans mot (donnée corrompue) donne un motif vide plutôt qu'une erreur.</summary>
    public static string Mask(string name)
    {
        ArgumentNullException.ThrowIfNull(name);
        var words = name.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(word =>
        {
            var chars = word.ToCharArray();
            for (var i = 1; i < chars.Length; i++)
            {
                if (char.IsLetterOrDigit(chars[i]))
                    chars[i] = '_';
            }

            return string.Join(' ', chars.Select(c => c.ToString()));
        });

        return string.Join("   ", words);
    }
}
