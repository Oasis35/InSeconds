namespace InSeconds.Deezer;

/// <summary>
/// Un morceau tel que Deezer le décrit. <see cref="Rank"/> est le rang Deezer (popularité), qui servira à la
/// difficulté du mode Runs ; <see cref="PreviewUrl"/> est vide quand Deezer n'a pas d'extrait.
/// </summary>
public sealed record DeezerTrack(
    long DeezerTrackId, string Artist, string Title, string? PreviewUrl, string? CoverHash, int? ReleaseYear, int? Rank);

/// <summary>
/// Résultat de la recherche d'un extrait. Trois cas distincts, jamais un <c>null</c> ambigu : « Deezer n'a pas
/// d'extrait » (<see cref="Missing"/>) n'est pas « Deezer n'a pas répondu » (<see cref="Unavailable"/>, quota,
/// panne), et seul le premier permet de conclure (piège 16 du CLAUDE.md racine).
/// </summary>
public abstract record PreviewLookup
{
    private PreviewLookup()
    {
    }

    /// <summary>Extrait trouvé : <paramref name="Url"/> est signée et expire (piège 14).</summary>
    public sealed record Found(string Url) : PreviewLookup;

    /// <summary>Réponse déterminée : pas d'extrait, ou morceau supprimé chez Deezer.</summary>
    public sealed record Missing : PreviewLookup;

    /// <summary>Pas de réponse exploitable (erreur HTTP, quota, service occupé) : l'état réel est inconnu.</summary>
    public sealed record Unavailable : PreviewLookup;
}

/// <summary>Résultat de la lecture d'un morceau chez Deezer, avec les mêmes trois cas que <see cref="PreviewLookup"/>.</summary>
public abstract record TrackMetadataLookup
{
    private TrackMetadataLookup()
    {
    }

    public sealed record Found(DeezerTrack Track) : TrackMetadataLookup;

    /// <summary>Réponse déterminée : ce morceau n'existe pas (ou plus) chez Deezer.</summary>
    public sealed record NotFound : TrackMetadataLookup;

    public sealed record Unavailable : TrackMetadataLookup;
}

/// <summary>L'extrait audio d'un morceau (URL signée de 30 secondes).</summary>
public interface IPreviewProvider
{
    Task<PreviewLookup> GetPreviewAsync(long deezerTrackId, CancellationToken ct = default);
}

/// <summary>
/// Résultat d'une recherche, avec la même distinction que <see cref="PreviewLookup"/> : « Deezer n'a rien trouvé »
/// (<see cref="Found"/> avec une liste vide) n'est pas « Deezer n'a pas répondu » (<see cref="Unavailable"/>).
/// </summary>
public abstract record SearchLookup
{
    private SearchLookup()
    {
    }

    /// <summary>Les morceaux trouvés, dans l'ordre de pertinence de Deezer (liste vide si rien ne correspond).</summary>
    public sealed record Found(IReadOnlyList<DeezerTrack> Tracks) : SearchLookup;

    /// <summary>Pas de réponse exploitable (erreur HTTP, quota, service occupé) : on ne sait pas ce que Deezer aurait trouvé.</summary>
    public sealed record Unavailable : SearchLookup;
}

/// <summary>Recherche de morceaux par texte.</summary>
public interface ITrackSearch
{
    Task<SearchLookup> SearchAsync(string query, int limit, CancellationToken ct = default);
}

/// <summary>Les informations d'un morceau (artiste, titre, pochette, année, rang, extrait) : l'état réel chez Deezer.</summary>
public interface ITrackMetadataSource
{
    Task<TrackMetadataLookup> GetTrackAsync(long deezerTrackId, CancellationToken ct = default);
}
