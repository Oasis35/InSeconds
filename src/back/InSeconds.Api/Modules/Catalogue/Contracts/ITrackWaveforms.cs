namespace InSeconds.Api.Modules.Catalogue.Contracts;

/// <summary>
/// La forme des extraits (barres de la waveform et énergie des basses du lecteur), pour les modes qui les font écouter. Calculée la nuit par
/// l'API, envoyée avec le morceau : le navigateur n'a plus à retélécharger l'extrait pour la dessiner. Rien qui identifie le morceau
/// (piège 31) : une silhouette de 2 Ko.
/// </summary>
public interface ITrackWaveforms
{
    /// <summary>
    /// La forme de chaque morceau (blob versionné, à passer tel quel au navigateur en base64). Un morceau sans forme calculée est absent du
    /// résultat : le navigateur calcule alors la sienne, et un avertissement le signale dans les journaux.
    /// </summary>
    Task<IReadOnlyDictionary<int, byte[]>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct);
}
