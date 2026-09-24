namespace InSeconds.Api.Common.Observability;

// Événements métier du parcours joueur, centralisés ici pour garder des noms de propriétés
// identiques partout (PlayerId, SessionId…) : c'est ce qui permet de reconstituer la
// chronologie d'un joueur en filtrant sur son PlayerId dans l'outil d'observabilité.
// Règle : jamais d'email, de pseudo ni de réponse saisie — seulement des identifiants
// techniques, des résultats (correct ou non, score) et le morceau attendu (public).
public static partial class PlayerActionLog
{
    [LoggerMessage(EventId = 1000, Level = LogLevel.Information,
        Message = "Partie {SessionId} démarrée par {PlayerId} (défi {DailyChallengeId})")]
    public static partial void SessionStarted(ILogger logger, int sessionId, Guid playerId, int dailyChallengeId);

    [LoggerMessage(EventId = 1001, Level = LogLevel.Information,
        Message = "Partie {SessionId} reprise par {PlayerId} ({AnsweredCount} réponse(s) déjà données)")]
    public static partial void SessionResumed(ILogger logger, int sessionId, Guid playerId, int answeredCount);

    [LoggerMessage(EventId = 1002, Level = LogLevel.Information,
        Message = "Réponse de {PlayerId} (partie {SessionId}, morceau {DailyChallengeTrackId}) : palier {ListenedSeconds}s, artiste {ArtistCorrect}, titre {TitleCorrect}, indice {HintLevel}, score {Score} — morceau n°{TrackPosition} : {TrackArtist} / {TrackTitle}")]
    public static partial void AnswerSubmitted(ILogger logger, Guid playerId, int sessionId, int dailyChallengeTrackId,
        decimal listenedSeconds, bool artistCorrect, bool titleCorrect, int hintLevel, int score,
        int trackPosition, string trackArtist, string trackTitle);

    [LoggerMessage(EventId = 1003, Level = LogLevel.Information,
        Message = "Partie {SessionId} terminée par {PlayerId} : score {TotalScore}")]
    public static partial void SessionCompleted(ILogger logger, int sessionId, Guid playerId, int totalScore);

    [LoggerMessage(EventId = 1004, Level = LogLevel.Information,
        Message = "Indice niveau {Level} demandé par {PlayerId} (partie {SessionId}, morceau {DailyChallengeTrackId})")]
    public static partial void HintRequested(ILogger logger, int level, Guid playerId, int sessionId, int dailyChallengeTrackId);

    [LoggerMessage(EventId = 1005, Level = LogLevel.Information,
        Message = "Partie {SessionId} abandonnée par {PlayerId}")]
    public static partial void SessionAbandoned(ILogger logger, int sessionId, Guid playerId);

    [LoggerMessage(EventId = 1006, Level = LogLevel.Information,
        Message = "Connexion par magic link : {PlayerId} ({LinkOutcome})")]
    public static partial void SignedIn(ILogger logger, Guid playerId, string linkOutcome);

    [LoggerMessage(EventId = 1007, Level = LogLevel.Information,
        Message = "Email « {EmailSubject} » envoyé (Resend {ResendEmailId})")]
    public static partial void EmailSent(ILogger logger, string emailSubject, string? resendEmailId);

    [LoggerMessage(EventId = 1101, Level = LogLevel.Warning,
        Message = "Échec de l'envoi de l'email « {EmailSubject} » (HTTP {HttpStatus})")]
    public static partial void EmailFailed(ILogger logger, Exception? exception, string emailSubject, int? httpStatus);

    [LoggerMessage(EventId = 1100, Level = LogLevel.Error,
        Message = "Erreur front ({Source}) sur {Url} : {ClientMessage} (HTTP {HttpStatus}, trace liée {RelatedTraceId}) — stack : {ClientStack}")]
    public static partial void ClientError(ILogger logger, string source, string? url, string clientMessage,
        int? httpStatus, string? relatedTraceId, string? clientStack);
}
