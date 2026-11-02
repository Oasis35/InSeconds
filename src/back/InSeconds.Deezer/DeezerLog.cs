using Microsoft.Extensions.Logging;

namespace InSeconds.Deezer;

/// <summary>
/// Journal du client Deezer. Jamais le texte d'une recherche (saisie en cours de l'autocomplétion
/// publique, potentiellement une donnée personnelle, piège 36) : seulement sa longueur.
/// </summary>
internal static partial class DeezerLog
{
    [LoggerMessage(EventId = 1210, Level = LogLevel.Warning,
        Message = "Deezer a renvoyé une erreur pour le morceau {DeezerTrackId} : code {DeezerCode} ({DeezerMessage}).")]
    public static partial void TrackError(ILogger logger, long deezerTrackId, int deezerCode, string? deezerMessage);

    [LoggerMessage(EventId = 1211, Level = LogLevel.Warning,
        Message = "Échec de la requête Deezer pour le morceau {DeezerTrackId}.")]
    public static partial void TrackRequestFailed(ILogger logger, Exception exception, long deezerTrackId);

    [LoggerMessage(EventId = 1212, Level = LogLevel.Warning,
        Message = "Deezer n'a renvoyé aucune preview pour le morceau {DeezerTrackId}.")]
    public static partial void NoPreview(ILogger logger, long deezerTrackId);

    [LoggerMessage(EventId = 1213, Level = LogLevel.Warning,
        Message = "Deezer a renvoyé une erreur pour une recherche ({QueryLength} caractères) : code {DeezerCode} ({DeezerMessage}).")]
    public static partial void SearchError(ILogger logger, int queryLength, int deezerCode, string? deezerMessage);

    [LoggerMessage(EventId = 1214, Level = LogLevel.Warning,
        Message = "Échec de la recherche Deezer pour une requête ({QueryLength} caractères).")]
    public static partial void SearchRequestFailed(ILogger logger, Exception exception, int queryLength);

    [LoggerMessage(EventId = 1215, Level = LogLevel.Warning,
        Message = "Deezer a renvoyé une erreur pour l'album {AlbumId} : code {DeezerCode} ({DeezerMessage}).")]
    public static partial void AlbumError(ILogger logger, long albumId, int deezerCode, string? deezerMessage);

    [LoggerMessage(EventId = 1216, Level = LogLevel.Warning,
        Message = "Échec de la requête Deezer pour l'album {AlbumId}.")]
    public static partial void AlbumRequestFailed(ILogger logger, Exception exception, long albumId);

    [LoggerMessage(EventId = 1217, Level = LogLevel.Warning,
        Message = "Réponse Deezer sans genres pour l'album {AlbumId} : considérée comme indisponible.")]
    public static partial void AlbumWithoutGenres(ILogger logger, long albumId);

    // Jamais l'adresse de l'extrait dans le journal : elle est signée (piège 14), seulement son hôte et le code HTTP.
    [LoggerMessage(EventId = 1218, Level = LogLevel.Warning,
        Message = "Téléchargement de l'extrait refusé : hôte {Host} non autorisé.")]
    public static partial void PreviewHostRefused(ILogger logger, string host);

    [LoggerMessage(EventId = 1219, Level = LogLevel.Warning,
        Message = "Téléchargement de l'extrait impossible : HTTP {HttpStatus} depuis {Host}.")]
    public static partial void PreviewDownloadStatus(ILogger logger, int httpStatus, string host);

    [LoggerMessage(EventId = 1220, Level = LogLevel.Warning,
        Message = "Téléchargement de l'extrait impossible : fichier de plus de {MaxBytes} octets.")]
    public static partial void PreviewTooLarge(ILogger logger, int maxBytes);

    [LoggerMessage(EventId = 1221, Level = LogLevel.Warning,
        Message = "Échec du téléchargement de l'extrait depuis {Host}.")]
    public static partial void PreviewDownloadFailed(ILogger logger, Exception exception, string host);
}
