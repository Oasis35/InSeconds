namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>
/// Le nom du fichier d'un extrait Deezer : la dernière partie du chemin de l'adresse, avant la signature (<c>?hdnea=…</c>). C'est le md5 du
/// contenu (30 morceaux sur 30 le jour de la mesure) : il ne change que si Deezer remplace l'extrait, contrairement à la signature, qui change à
/// chaque demande (piège 14). Il décide si la forme d'un morceau est périmée.
/// </summary>
internal static class PreviewFile
{
    /// <summary>Le nom du fichier, ou <c>null</c> si l'adresse n'est pas celle d'un fichier.</summary>
    public static string? NameOf(string? previewUrl)
    {
        if (!Uri.TryCreate(previewUrl, UriKind.Absolute, out var uri))
            return null;

        var name = uri.AbsolutePath[(uri.AbsolutePath.LastIndexOf('/') + 1)..];
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }
}
