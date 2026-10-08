namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Codes d'erreur du défi du jour, côté joueur (préfixe <c>daily.</c>, § 5.6 du plan v2) ; ceux de l'admin sont dans <see cref="DailyAdminErrorCodes"/>. Ne jamais renommer un code publié.</summary>
public static class DailyErrorCodes
{
    /// <summary>Pas de défi aujourd'hui et le pool ne permet pas d'en générer un.</summary>
    public const string NoChallenge = "daily.no_challenge";

    public const string AlreadyPlayed = "daily.already_played";

    /// <summary>Le joueur a abandonné (bouton) ou laissé expirer la partie du jour : il ne la rejoue pas.</summary>
    public const string Abandoned = "daily.abandoned";

    public const string SessionNotFound = "daily.session_not_found";

    public const string TrackNotFound = "daily.track_not_found";

    /// <summary>Piège 35 : le morceau en cours n'a pas reçu sa réponse, le verrou ne se déplace pas.</summary>
    public const string TrackLockNotReleased = "daily.track_lock_not_released";

    /// <summary>L'indice n'est pas encore débloqué : la durée écoutée n'a pas atteint son seuil.</summary>
    public const string HintLocked = "daily.hint_locked";

    public const string AlreadyAnswered = "daily.already_answered";

    /// <summary>Le palier annoncé est inférieur à la durée que le serveur a vu écouter sur ce morceau (anti-triche).</summary>
    public const string ListenedBelowMinimum = "daily.listened_duration_below_verified_minimum";
}

/// <summary>
/// Codes d'erreur des routes et tâches **admin** du défi du jour (préfixe <c>admin.</c>, § 5.6 du plan v2). Ne jamais renommer un code publié.
/// </summary>
public static class DailyAdminErrorCodes
{
    /// <summary>Pas assez de morceaux jouables hors cooldown : renvoyé par la tâche, lu par <c>GET /api/admin/jobs/{id}</c>.</summary>
    public const string PoolInsufficient = "admin.pool_insufficient";

    /// <summary>Une date qui n'est pas au format aaaa-mm-jj.</summary>
    public const string InvalidDate = "admin.invalid_date";

    /// <summary>Une période dont le début dépasse la fin, ou de plus d'un an.</summary>
    public const string InvalidPeriod = "admin.invalid_period";

    /// <summary>La photo figée n'a de sens que pour un jour terminé pour de bon (J-2 et avant) : la veille peut encore recevoir une fin de partie (piège 18).</summary>
    public const string DayNotOver = "admin.day_not_over";

    /// <summary>La tâche qui fige les statistiques a échoué sur au moins un jour (les autres ont été figés) : voir le journal.</summary>
    public const string CloseDayFailed = "admin.close_day_failed";
}
