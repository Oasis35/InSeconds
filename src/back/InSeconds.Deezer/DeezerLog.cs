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
}
