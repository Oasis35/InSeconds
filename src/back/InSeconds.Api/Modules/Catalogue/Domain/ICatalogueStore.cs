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

    /// <summary>Le morceau avec ses genres, suivi pour être modifié : ce qu'il faut pour remplacer ses genres.</summary>
    Task<Track?> FindWithGenresAsync(int id, CancellationToken ct);

    /// <summary>
    /// Le genre de ce nom (casse ignorée), celui de Deezer s'il existe déjà ; sinon un genre neuf, à l'identifiant négatif (jamais celui d'un
    /// genre de Deezer), enregistré avec la transaction du handler.
    /// </summary>
    Task<Genre> FindOrAddGenreByNameAsync(string name, CancellationToken ct);

    /// <summary>Le morceau avec ses thèmes, suivi pour être modifié.</summary>
    Task<Track?> FindWithThemesAsync(int id, CancellationToken ct);

    /// <summary>Les morceaux de ces identifiants avec leurs thèmes, suivis (un identifiant inconnu est absent du résultat).</summary>
    Task<IReadOnlyList<Track>> FindManyWithThemesAsync(IReadOnlyCollection<int> ids, CancellationToken ct);

    /// <summary>Les thèmes de ces identifiants, suivis (un identifiant inconnu est absent du résultat).</summary>
    Task<IReadOnlyList<Theme>> FindThemesAsync(IReadOnlyCollection<int> ids, CancellationToken ct);

    /// <summary>Ajoute le thème et lui attribue tout de suite son identifiant.</summary>
    ValueTask AddThemeAsync(Theme theme, CancellationToken ct);

    void RemoveTheme(Theme theme);

    /// <summary>Le thème, suivi pour être modifié.</summary>
    Task<Theme?> FindThemeAsync(int id, CancellationToken ct);

    /// <summary>Un thème porte déjà ce nom (casse ignorée), hors <paramref name="exceptThemeId"/>.</summary>
    Task<bool> ThemeNameTakenAsync(string name, int? exceptThemeId, CancellationToken ct);

    /// <summary>Au moins un morceau a ce thème.</summary>
    Task<bool> ThemeInUseAsync(int themeId, CancellationToken ct);

    /// <summary>Les morceaux qui ont ce thème.</summary>
    Task<int> CountThemeTracksAsync(int themeId, CancellationToken ct);

    /// <summary>Cet identifiant Deezer est déjà celui d'un morceau (hors <paramref name="exceptTrackId"/>).</summary>
    Task<bool> DeezerIdTakenAsync(long deezerTrackId, int? exceptTrackId, CancellationToken ct);

    /// <summary>
    /// Les morceaux dont l'extrait est à recontrôler : tout le pool, sauf les morceaux désactivés (le cooldown n'en exclut plus aucun :
    /// un mode peut tirer n'importe quel morceau). Renvoyés **détachés** : le contrôle dure plusieurs minutes, rien ne doit rester suivi
    /// ni sous transaction pendant ce temps.
    /// </summary>
    Task<IReadOnlyList<Track>> ListRefreshCandidatesAsync(CancellationToken ct);

    /// <summary>
    /// Les genres de ces références, prêts à être posés sur un morceau suivi : un genre déjà là est repris (son nom remis à jour s'il a
    /// changé), les autres sont ajoutés et enregistrés avec la transaction du handler.
    /// </summary>
    Task<IReadOnlyList<Genre>> EnsureGenresAsync(IReadOnlyCollection<GenreRef> genres, CancellationToken ct);

    /// <summary>
    /// Enregistre tout de suite (son propre <c>SaveChanges</c>, pas la transaction d'un handler) les genres d'un album pour **tous** les morceaux du pool qui
    /// en font partie, et note qu'ils ont été lus (liste vide : l'album n'en a pas, ou n'existe plus : ils ne seront pas redemandés).
    /// </summary>
    Task SaveAlbumGenresAsync(long albumId, IReadOnlyCollection<GenreRef> genres, DateTimeOffset now, CancellationToken ct);

    /// <summary>
    /// Enregistre tout de suite (sa propre requête, pas la transaction d'un handler) l'état de l'extrait, le rang et l'album de
    /// ces morceaux. Un morceau supprimé entre-temps est ignoré. Un morceau dont les genres sont à relire (il a changé d'album) perd
    /// ceux de l'ancien. Renvoie les identifiants réellement enregistrés.
    /// </summary>
    Task<IReadOnlySet<int>> SaveRefreshedAsync(IReadOnlyCollection<Track> tracks, CancellationToken ct);

    /// <summary>
    /// Enregistre tout de suite (sa propre requête, pas la transaction d'un handler) la forme de l'extrait d'un morceau déjà passée par
    /// <see cref="Track.RecordWaveform"/>. Un morceau supprimé entre-temps est ignoré (faux). N'écrit que la forme : elle ne croise jamais le
    /// contrôle de l'extrait (<see cref="SaveRefreshedAsync"/>).
    /// </summary>
    Task<bool> SaveWaveformAsync(Track track, CancellationToken ct);

    /// <summary>
    /// Les morceaux dont la forme est à calculer (jamais calculée), non désactivés et à extrait disponible, renvoyés **détachés** : le calcul dure
    /// plusieurs minutes (téléchargements espacés). Les formes d'une ancienne version ou d'un extrait remplacé ne se voient qu'avec l'adresse
    /// actuelle de l'extrait, que seul le contrôle nocturne lit.
    /// </summary>
    Task<IReadOnlyList<Track>> ListWithoutWaveformAsync(CancellationToken ct);

    /// <summary>La date d'ajout du morceau le plus récent parmi ceux sans forme (vide : aucun n'en manque).</summary>
    Task<DateTimeOffset?> LatestAddedWithoutWaveformAsync(CancellationToken ct);

    // ── Le sas des candidats ──

    /// <summary>Ajoute le candidat et lui attribue tout de suite son identifiant.</summary>
    ValueTask AddCandidateAsync(Candidate candidate, CancellationToken ct);

    void RemoveCandidate(Candidate candidate);

    /// <summary>Le candidat, suivi pour être modifié.</summary>
    Task<Candidate?> FindCandidateAsync(int id, CancellationToken ct);

    /// <summary>Les candidats de ces identifiants, suivis (un identifiant inconnu est absent du résultat).</summary>
    Task<IReadOnlyList<Candidate>> FindCandidatesAsync(IReadOnlyCollection<int> ids, CancellationToken ct);

    /// <summary>Les candidats qui ont l'un de ces identifiants Deezer, suivis.</summary>
    Task<IReadOnlyList<Candidate>> FindCandidatesByDeezerIdsAsync(IReadOnlyCollection<long> deezerTrackIds, CancellationToken ct);

    /// <summary>Parmi ces identifiants Deezer, ceux qui sont déjà ceux d'un morceau du pool.</summary>
    Task<IReadOnlySet<long>> DeezerIdsInPoolAsync(IReadOnlyCollection<long> deezerTrackIds, CancellationToken ct);

    /// <summary>Les identifiants des candidats pas encore lus chez Deezer (écartés exclus), dans l'ordre d'import.</summary>
    Task<IReadOnlyList<int>> ListPendingCandidateIdsAsync(CancellationToken ct);

    /// <summary>
    /// Les candidats de ces identifiants encore à lire, renvoyés **détachés** : la lecture appelle Deezer, rien ne doit rester suivi ni sous
    /// transaction pendant ce temps.
    /// </summary>
    Task<IReadOnlyList<Candidate>> ListCandidatesToReadAsync(IReadOnlyCollection<int> ids, CancellationToken ct);

    /// <summary>
    /// Enregistre tout de suite (sa propre requête, pas la transaction d'un handler) ce que Deezer a répondu pour ces candidats déjà passés par
    /// <see cref="Candidate.RecordRead"/> ou <see cref="Candidate.RecordNotFound"/>. Un candidat supprimé entre-temps est ignoré.
    /// </summary>
    Task SaveCandidateReadsAsync(IReadOnlyCollection<Candidate> candidates, CancellationToken ct);
}
