using System.Text.RegularExpressions;

namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>
/// Un thème : une sélection de morceaux que l'admin nomme (« Années 80 », « Films »…), à part des genres de Deezer. La liste est celle de l'admin
/// (ajout, renommage, suppression d'un thème que plus aucun morceau n'a) et un morceau n'en prend jamais un hors de cette liste. Runs en tire les
/// playlists à thème.
/// </summary>
public sealed partial class Theme
{
    /// <summary>La longueur d'un nom, celle de la colonne.</summary>
    public const int MaxNameLength = 60;

    /// <summary>La longueur du nom d'une icône, celle de la colonne.</summary>
    public const int MaxIconLength = 40;

    private Theme()
    {
    }

    public Theme(string name, DateTimeOffset now)
    {
        Name = Clean(name);
        CreatedAt = now;
    }

    /// <summary>Attribué dès l'ajout (séquence), pour que l'endpoint le mette dans sa réponse avant l'enregistrement.</summary>
    public int Id { get; private set; }

    /// <summary>Le nom, unique sans tenir compte de la casse.</summary>
    public string Name { get; private set; } = null!;

    public DateTimeOffset CreatedAt { get; private set; }

    /// <summary>Le nom de l'icône (une icône Lucide, en minuscules et tirets : « clapperboard »), montrée à côté du nom du thème ; vide : pas d'icône.</summary>
    public string? Icon { get; private set; }

    public void Rename(string name) => Name = Clean(name);

    /// <summary>Donne au thème cette icône, ou la retire (<c>null</c> ou vide).</summary>
    public void SetIcon(string? icon)
    {
        var cleaned = icon?.Trim();
        if (string.IsNullOrEmpty(cleaned))
        {
            Icon = null;
            return;
        }

        if (!IsValidIcon(cleaned))
            throw new ArgumentException("Un nom d'icône est en minuscules, chiffres et tirets, de 40 caractères au plus.", nameof(icon));
        Icon = cleaned;
    }

    /// <summary>Un nom d'icône : minuscules, chiffres et tirets (jamais en début, en fin ni doublé), 40 caractères au plus.</summary>
    public static bool IsValidIcon(string icon) => icon.Length <= MaxIconLength && IconPattern().IsMatch(icon);

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")]
    private static partial Regex IconPattern();

    private static string Clean(string name)
    {
        var cleaned = name?.Trim();
        if (string.IsNullOrEmpty(cleaned) || cleaned.Length > MaxNameLength)
            throw new ArgumentException("Un thème a un nom non vide de 60 caractères au plus.", nameof(name));
        return cleaned;
    }
}
