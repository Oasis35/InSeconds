namespace InSeconds.Api.Modules.Catalogue.Domain;

/// <summary>
/// Les écritures et les lectures préalables du sas « À valider » : les candidats à l'ajout au pool. Séparé de <see cref="ICatalogueStore"/> :
/// un candidat n'est jamais un morceau du pool, il n'y entre que par l'ajout.
/// </summary>
public interface ICandidateStore
{
    /// <summary>Ajoute le candidat et lui attribue tout de suite son identifiant.</summary>
    ValueTask AddCandidateAsync(Candidate candidate, CancellationToken ct);

    void RemoveCandidate(Candidate candidate);

    /// <summary>Le candidat, suivi pour être modifié.</summary>
    Task<Candidate?> FindCandidateAsync(int id, CancellationToken ct);

    /// <summary>Les candidats de ces identifiants, suivis (un identifiant inconnu est absent du résultat).</summary>
    Task<IReadOnlyList<Candidate>> FindCandidatesAsync(IReadOnlyCollection<int> ids, CancellationToken ct);

    /// <summary>Les candidats qui ont l'un de ces identifiants Deezer, suivis.</summary>
    Task<IReadOnlyList<Candidate>> FindCandidatesByDeezerIdsAsync(IReadOnlyCollection<long> deezerTrackIds, CancellationToken ct);

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
