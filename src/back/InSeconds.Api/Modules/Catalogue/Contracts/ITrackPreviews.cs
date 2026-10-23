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

    /// <summary>
    /// L'extrait d'un morceau, en distinguant « Deezer n'en a pas » (réponse déterminée : un mode peut en tirer une conséquence, Runs neutralise le
    /// morceau) de « Deezer n'a pas répondu » (panne, quota : l'état réel est inconnu, rien ne doit en être conclu, piège 16).
    /// </summary>
    Task<TrackPreview> GetAsync(TrackInfo track, CancellationToken ct);
}

/// <summary>Ce que Deezer dit de l'extrait d'un morceau.</summary>
public enum PreviewAvailability
{
    /// <summary>Un extrait est disponible (<see cref="TrackPreview.Url"/>).</summary>
    Available,

    /// <summary>Réponse déterminée : pas d'extrait, ou morceau supprimé chez Deezer.</summary>
    Missing,

    /// <summary>Pas de réponse exploitable (erreur HTTP, quota, service occupé).</summary>
    Unavailable,
}

/// <param name="Url">L'adresse signée et périssable (piège 14), seulement si l'extrait est disponible.</param>
public sealed record TrackPreview(PreviewAvailability Availability, string? Url)
{
    public static TrackPreview Missing { get; } = new(PreviewAvailability.Missing, null);

    public static TrackPreview Unavailable { get; } = new(PreviewAvailability.Unavailable, null);

    public static TrackPreview Available(string url) => new(PreviewAvailability.Available, url);
}
