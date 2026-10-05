namespace InSeconds.Api.Modules.Catalogue.Contracts;

/// <summary>
/// Ce qu'un morceau doit à l'usage qu'en fait le jeu : la dernière apparition dans un défi, le nombre
/// d'apparitions, le jour où il redevient tirable, et sa présence dans le défi du jour.
/// </summary>
/// <param name="UnlockDate">Fin du cooldown (<c>LastUsedDate</c> + <c>Daily:TrackCooldownDays</c>), vide s'il n'a jamais servi.</param>
public sealed record TrackUsage(DateOnly? LastUsedDate, int UsageCount, DateOnly? UnlockDate, bool InTodayChallenge)
{
    /// <summary>Jamais utilisé.</summary>
    public static readonly TrackUsage None = new(null, 0, null, false);

    /// <summary>Déjà dans un défi : ni suppression ni actualisation.</summary>
    public bool IsUsed => UsageCount > 0;
}

/// <summary>
/// L'usage des morceaux, **fourni par Daily** (§ 4.4 : le cooldown se calcule sur <c>challenge_tracks</c> et
/// <c>challenges.date</c>), que Catalogue ne connaît pas : Daily dépend de Catalogue, pas l'inverse.
/// Tant que Daily n'existe pas (E), <c>NoTrackUsage</c> répond « aucun usage » ; Daily le remplacera en
/// enregistrant sa propre implémentation.
/// </summary>
public interface ITrackUsage
{
    /// <summary>L'usage de ces morceaux ; un morceau absent du résultat n'a jamais servi (<see cref="TrackUsage.None"/>).</summary>
    Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct);

    /// <summary>Les morceaux qu'un défi de ce jour ne pourrait pas tirer à cause du cooldown.</summary>
    Task<IReadOnlySet<int>> GetTracksInCooldownAsync(DateOnly day, CancellationToken ct);
}
