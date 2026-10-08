namespace InSeconds.Api.Modules.Catalogue.Contracts;

/// <summary>
/// L'extrait audio des morceaux (§ 5.3 du plan v2), pour les modes qui les font écouter : l'adresse signée de 30 secondes que le
/// navigateur charge directement chez Deezer. Elle expire (piège 14) : à demander au moment de jouer, jamais à garder.
/// </summary>
public interface ITrackPreviews
{
    /// <summary>
    /// L'adresse de l'extrait de chaque morceau. Un morceau absent du résultat n'a pas d'extrait utilisable : Deezer n'en a pas, ou n'a
    /// pas répondu (le joueur peut alors le passer, comme en v1).
    /// </summary>
    Task<IReadOnlyDictionary<int, string>> GetUrlsAsync(IReadOnlyCollection<TrackInfo> tracks, CancellationToken ct);
}
