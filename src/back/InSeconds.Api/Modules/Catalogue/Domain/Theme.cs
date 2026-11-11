namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>
/// Un thème : une sélection de morceaux que l'admin nomme (« Années 80 », « Films »…), à part des genres de Deezer. La liste est celle de l'admin
/// (ajout, renommage, suppression d'un thème que plus aucun morceau n'a) et un morceau n'en prend jamais un hors de cette liste. Runs en tire les
/// playlists à thème.
/// </summary>
public sealed class Theme
{
    /// <summary>La longueur d'un nom, celle de la colonne.</summary>
    public const int MaxNameLength = 60;

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

    public void Rename(string name) => Name = Clean(name);

    private static string Clean(string name)
    {
        var cleaned = name?.Trim();
        if (string.IsNullOrEmpty(cleaned) || cleaned.Length > MaxNameLength)
            throw new ArgumentException("Un thème a un nom non vide de 60 caractères au plus.", nameof(name));
        return cleaned;
    }
}
