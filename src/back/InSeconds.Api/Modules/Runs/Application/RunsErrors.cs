namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Codes d'erreur du mode Run, côté joueur (préfixe <c>runs.</c>), arrêtés avec la conception : le même nom qu'au Daily pour la même situation.
/// **Ne jamais renommer un code publié** (le front les traduit). Les routes joueur qui les rendent arrivent avec la partie ; les routes admin de
/// l'accès utilisent les codes communs (<c>common.not_found</c>).
/// </summary>
public static class RunsErrorCodes
{
    /// <summary>Lancer un run sans accès (invité, compte non autorisé).</summary>
    public const string AccessDenied = "runs.access_denied";

    /// <summary>Le pool jouable n'a pas assez de morceaux pour un défi.</summary>
    public const string NoChallenge = "runs.no_challenge";

    public const string ChallengeNotFound = "runs.challenge_not_found";

    public const string SessionNotFound = "runs.session_not_found";

    public const string AlreadyPlayed = "runs.already_played";

    public const string Abandoned = "runs.abandoned";

    public const string TrackNotFound = "runs.track_not_found";

    /// <summary>Piège 35 : un autre morceau que le morceau en cours.</summary>
    public const string TrackLockNotReleased = "runs.track_lock_not_released";

    public const string AlreadyAnswered = "runs.already_answered";

    public const string ComparisonLocked = "runs.comparison_locked";
}

internal static partial class RunsLog
{
    [LoggerMessage(EventId = 1400, Level = LogLevel.Error,
        Message = "Réglages Runs incohérents, valeurs par défaut utilisées : {Problems}")]
    public static partial void InvalidOptions(ILogger logger, string problems);

    [LoggerMessage(EventId = 1401, Level = LogLevel.Information, Message = "Accès au mode Run accordé à {PlayerId}")]
    public static partial void AccessGranted(ILogger logger, Guid playerId);

    [LoggerMessage(EventId = 1402, Level = LogLevel.Information, Message = "Accès au mode Run retiré à {PlayerId}")]
    public static partial void AccessRevoked(ILogger logger, Guid playerId);
}
