namespace InSeconds.Api.Modules.Catalogue.Contracts;

/// <summary>Un morceau, pour les modules qui le jouent (Gameplay, Daily, Runs).</summary>
/// <param name="Artist">Nom de référence pour corriger les réponses.</param>
/// <param name="Title">Titre brut de Deezer, référence de correction.</param>
/// <param name="DisplayTitle">Titre montré au joueur (sans parenthèses ni crochets, <see cref="TrackTitles.CleanDisplayTitle"/>).</param>
/// <param name="CoverUrl">Adresse de la pochette, reconstruite avec <c>Catalogue:CoverUrlTemplate</c>.</param>
/// <param name="DeezerRank">Rang (popularité) chez Deezer, vide s'il n'a jamais été lu : la difficulté de Runs en tire ses tranches.</param>
/// <param name="Genres">Noms des genres de l'album du morceau (Deezer), par ordre alphabétique ; vide tant qu'ils ne sont pas lus, ou si l'album n'en a pas. Aucun mode ne s'en sert encore.</param>
public sealed record TrackInfo(
    int Id, long DeezerTrackId, string Artist, string Title, string DisplayTitle, string? CoverUrl, int? ReleaseYear, int? DeezerRank,
    IReadOnlyList<string> Genres);

/// <summary>Lecture des morceaux par les autres modules (§ 5.3 du plan v2).</summary>
public interface ITrackDirectory
{
    /// <summary>Les morceaux de ces identifiants ; un identifiant inconnu est absent du résultat.</summary>
    Task<IReadOnlyDictionary<int, TrackInfo>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct);

    /// <summary>
    /// Les identifiants des morceaux qu'un mode peut faire jouer : non désactivés, extrait disponible (jamais « inconnu »).
    /// Triés par identifiant : un tirage à graine doit partir du même ordre à chaque appel.
    /// </summary>
    Task<IReadOnlyList<int>> ListPlayableIdsAsync(CancellationToken ct);
}
