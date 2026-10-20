namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>Un genre tel que Deezer le donne : son identifiant (celui de Deezer) et son nom.</summary>
public sealed record GenreRef(long Id, string Name);

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
    /// Les morceaux dont l'extrait est à recontrôler : tout le pool, sauf les morceaux désactivés (le cooldown n'en exclut plus aucun :
    /// un mode peut tirer n'importe quel morceau). Renvoyés **détachés** : le contrôle dure plusieurs minutes, rien ne doit rester suivi
    /// ni sous transaction pendant ce temps.
    /// </summary>
    Task<IReadOnlyList<Track>> ListRefreshCandidatesAsync(CancellationToken ct);

    /// <summary>
    /// Les genres de ces références, prêts à être posés sur un morceau suivi : ils sont écrits tout de suite (un genre déjà là est repris,
    /// son nom remis à jour s'il a changé), sans jamais échouer si un autre ajout écrit le même genre au même moment.
    /// </summary>
    Task<IReadOnlyList<Genre>> EnsureGenresAsync(IReadOnlyCollection<GenreRef> genres, CancellationToken ct);

    /// <summary>
    /// Enregistre tout de suite (sa propre transaction, pas celle d'un handler) les genres d'un album pour **tous** les morceaux du pool qui
    /// en font partie, et note qu'ils ont été lus (liste vide : l'album n'en a pas, ou n'existe plus : ils ne seront pas redemandés).
    /// </summary>
    Task SaveAlbumGenresAsync(long albumId, IReadOnlyCollection<GenreRef> genres, DateTimeOffset now, CancellationToken ct);

    /// <summary>
    /// Enregistre tout de suite (sa propre requête, pas la transaction d'un handler) l'état de l'extrait, le rang et l'album de
    /// ces morceaux. Un morceau supprimé entre-temps est ignoré. Renvoie les identifiants réellement enregistrés.
    /// </summary>
    Task<IReadOnlySet<int>> SaveRefreshedAsync(IReadOnlyCollection<Track> tracks, CancellationToken ct);
}
