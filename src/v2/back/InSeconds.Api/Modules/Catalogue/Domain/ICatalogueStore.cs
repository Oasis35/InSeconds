namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>
/// Écritures du module Catalogue, et les lectures qui les précèdent. Rien n'est enregistré ici : dans un
/// handler Wolverine, la transaction est appliquée par Wolverine (<c>AutoApplyTransactions</c>).
/// </summary>
public interface ICatalogueStore
{
    /// <summary>Ajoute le morceau et lui attribue tout de suite son identifiant.</summary>
    ValueTask AddAsync(Track track, CancellationToken ct);

    void Remove(Track track);

    /// <summary>Le morceau, suivi pour être modifié.</summary>
    Task<Track?> FindAsync(int id, CancellationToken ct);

    /// <summary>Cet identifiant Deezer est déjà celui d'un morceau (hors <paramref name="exceptTrackId"/>).</summary>
    Task<bool> DeezerIdTakenAsync(long deezerTrackId, int? exceptTrackId, CancellationToken ct);

    /// <summary>
    /// Les morceaux dont l'extrait est à recontrôler : non désactivés, hors <paramref name="excludedTrackIds"/>
    /// (ceux qui ne seront pas tirables). Renvoyés **détachés** : le contrôle dure plusieurs minutes, rien ne doit
    /// rester suivi ni sous transaction pendant ce temps.
    /// </summary>
    Task<IReadOnlyList<Track>> ListRefreshCandidatesAsync(IReadOnlyCollection<int> excludedTrackIds, CancellationToken ct);

    /// <summary>
    /// Enregistre tout de suite (sa propre requête, pas la transaction d'un handler) l'état de l'extrait et le rang de
    /// ces morceaux. Un morceau supprimé entre-temps est ignoré. Renvoie les identifiants réellement enregistrés.
    /// </summary>
    Task<IReadOnlySet<int>> SaveRefreshedAsync(IReadOnlyCollection<Track> tracks, CancellationToken ct);
}
