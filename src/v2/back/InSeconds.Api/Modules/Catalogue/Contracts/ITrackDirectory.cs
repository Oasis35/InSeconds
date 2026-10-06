namespace InSeconds.Api.Modules.Catalogue.Contracts;

/// <summary>Un morceau, pour les modules qui le jouent (Gameplay, Daily).</summary>
/// <param name="Artist">Nom de référence pour corriger les réponses.</param>
/// <param name="Title">Titre brut de Deezer, référence de correction.</param>
/// <param name="DisplayTitle">Titre montré au joueur (sans parenthèses ni crochets, <see cref="TrackTitles.CleanDisplayTitle"/>).</param>
/// <param name="CoverUrl">Adresse de la pochette, reconstruite avec <c>Catalogue:CoverUrlTemplate</c>.</param>
public sealed record TrackInfo(
    int Id, long DeezerTrackId, string Artist, string Title, string DisplayTitle, string? CoverUrl, int? ReleaseYear);

/// <summary>Lecture des morceaux par les autres modules (§ 5.3 du plan v2).</summary>
public interface ITrackDirectory
{
    /// <summary>Les morceaux de ces identifiants ; un identifiant inconnu est absent du résultat.</summary>
    Task<IReadOnlyDictionary<int, TrackInfo>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct);
}
