using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Codes d'erreur du mode Run, côté joueur (préfixe <c>runs.</c>), arrêtés avec la conception : le même nom qu'au Daily pour la même situation.
/// **Ne jamais renommer un code publié** (le front les traduit). Les routes admin de l'accès utilisent les codes communs (<c>common.not_found</c>).
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

    /// <summary>La difficulté d'une manche ne se choisit plus (pas la manche en cours, pas de choix, déjà choisie ou déjà commencée).</summary>
    public const string DifficultyLocked = "runs.difficulty_locked";

    /// <summary>Une carte qui n'est pas (ou plus) dans la main.</summary>
    public const string CardNotFound = "runs.card_not_found";

    /// <summary>Pas d'offre ouverte (la manche a commencé, une carte est déjà prise), ou une carte que l'offre ne propose pas.</summary>
    public const string OfferClosed = "runs.offer_closed";

    /// <summary>La main est pleine : prendre une carte demande d'en lâcher une.</summary>
    public const string HandFull = "runs.hand_full";

    /// <summary>La même carte est déjà active sur ce morceau (ou sur la manche, pour « Seuil abaissé »).</summary>
    public const string CardAlreadyActive = "runs.card_already_active";

    /// <summary>La carte n'a rien sur quoi jouer : plus de morceau en réserve pour le Joker, pas de chrono pour le Sablier.</summary>
    public const string CardUnavailable = "runs.card_unavailable";
}

/// <summary>Problèmes du mode Run, en <c>ProblemDetails</c> avec leur code (<see cref="RunsErrorCodes"/>).</summary>
internal static class RunsProblems
{
    public static ProblemDetails AccessDenied() =>
        ApiProblem.Of(StatusCodes.Status403Forbidden, RunsErrorCodes.AccessDenied, "Ce compte ne peut pas lancer de run.");

    public static ProblemDetails NoChallenge() =>
        ApiProblem.Of(StatusCodes.Status503ServiceUnavailable, RunsErrorCodes.NoChallenge, "Pas assez de morceaux jouables pour une playlist.");

    public static ProblemDetails ChallengeNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, RunsErrorCodes.ChallengeNotFound, "Playlist introuvable.");

    /// <summary>La partie d'un autre joueur répond comme une partie inconnue : rien n'en est révélé.</summary>
    public static ProblemDetails SessionNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, RunsErrorCodes.SessionNotFound, "Partie introuvable.");

    /// <summary>Une partie qui n'est plus en cours : gagnée ou perdue (<c>runs.already_played</c>), ou abandonnée.</summary>
    public static ProblemDetails NotPending(RunSessionStatus status) =>
        status == RunSessionStatus.Abandoned
            ? ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.Abandoned, "Tu as abandonné cette playlist.")
            : ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.AlreadyPlayed, "Tu as déjà joué cette playlist.");

    /// <summary>La comparaison demande d'avoir fini sa propre partie : un ami qui n'a pas joué n'y voit rien.</summary>
    public static ProblemDetails ComparisonLocked() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.ComparisonLocked, "La comparaison s'ouvre une fois ta partie terminée.");

    public static ProblemDetails DifficultyLocked() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.DifficultyLocked, "La difficulté de cette manche ne se choisit plus.");

    public static ProblemDetails DifficultyNotOffered() =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, ErrorCodes.BadRequest, "Cette difficulté n'est pas proposée pour cette manche.");

    public static ProblemDetails CardNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, RunsErrorCodes.CardNotFound, "Cette carte n'est pas dans ta main.");

    public static ProblemDetails OfferClosed() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.OfferClosed, "Cette offre n'est plus ouverte.");

    public static ProblemDetails HandFull() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.HandFull, "Ta main est pleine : lâche une carte pour en prendre une.");

    public static ProblemDetails CardAlreadyActive() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.CardAlreadyActive, "Cette carte est déjà jouée sur ce morceau.");

    public static ProblemDetails CardUnavailable() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.CardUnavailable, "Cette carte ne peut pas se jouer ici.");

    /// <summary>Le refus d'une carte (prise, lâcher, jeu) en problème, ou rien.</summary>
    public static ProblemDetails ForCard(RunCardRefusal? refusal) => refusal switch
    {
        null => WolverineContinue.NoProblems,
        RunCardRefusal.NotInHand => CardNotFound(),
        RunCardRefusal.AlreadyActive => CardAlreadyActive(),
        RunCardRefusal.OfferClosed => OfferClosed(),
        RunCardRefusal.HandFull => HandFull(),
        _ => CardUnavailable(),
    };

    public static ProblemDetails TrackNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, RunsErrorCodes.TrackNotFound, "Morceau introuvable dans cette playlist.");

    public static ProblemDetails AlreadyAnswered() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.AlreadyAnswered, "Ce morceau a déjà reçu sa réponse.");

    /// <summary>Piège 35 : le morceau en cours n'a pas reçu sa réponse, on ne passe pas à un autre.</summary>
    public static ProblemDetails TrackLockNotReleased() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, RunsErrorCodes.TrackLockNotReleased, "Le morceau en cours n'a pas encore reçu sa réponse.");

    public static ProblemDetails ListenedTooLong(decimal listenSeconds) =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, ErrorCodes.BadRequest, $"L'écoute d'un morceau dure {listenSeconds} s au plus.");

    /// <summary>Pourquoi on ne peut pas agir sur ce morceau maintenant, ou rien si c'est le morceau en cours.</summary>
    public static ProblemDetails? ForTurn(RunTrackTurn turn) => turn switch
    {
        RunTrackTurn.Current => null,
        RunTrackTurn.AlreadyAnswered => AlreadyAnswered(),
        RunTrackTurn.NotYet => TrackLockNotReleased(),
        _ => TrackNotFound(),
    };
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

    [LoggerMessage(EventId = 1403, Level = LogLevel.Information,
        Message = "Run {SessionId} lancé par {PlayerId} (playlist {ChallengeCode})")]
    public static partial void RunLaunched(ILogger logger, int sessionId, Guid playerId, string challengeCode);

    [LoggerMessage(EventId = 1404, Level = LogLevel.Information,
        Message = "Partie {SessionId} démarrée par {PlayerId} sur la playlist {ChallengeCode}")]
    public static partial void SessionJoined(ILogger logger, int sessionId, Guid playerId, string challengeCode);

    [LoggerMessage(EventId = 1405, Level = LogLevel.Information,
        Message = "Partie {SessionId} reprise par {PlayerId} ({AnsweredCount} réponse(s) déjà données)")]
    public static partial void SessionResumed(ILogger logger, int sessionId, Guid playerId, int answeredCount);

    // Jamais la réponse saisie : seulement le verdict, les points et le morceau attendu (donnée de la playlist).
    [LoggerMessage(EventId = 1406, Level = LogLevel.Information,
        Message = "Réponse de {PlayerId} (partie {SessionId}, morceau {TrackId}, n°{TrackPosition}, manche {Round}) : artiste {ArtistCorrect}, titre {TitleCorrect}, points {Points}")]
    public static partial void AnswerSubmitted(
        ILogger logger, Guid playerId, int sessionId, int trackId, int trackPosition, int round, bool artistCorrect, bool titleCorrect, int points);

    [LoggerMessage(EventId = 1407, Level = LogLevel.Warning,
        Message = "Morceau {TrackId} sans extrait chez Deezer : neutralisé dans la partie {SessionId} (n°{TrackPosition}, manche {Round})")]
    public static partial void TrackNeutralized(ILogger logger, int trackId, int sessionId, int trackPosition, int round);

    [LoggerMessage(EventId = 1408, Level = LogLevel.Information,
        Message = "Partie {SessionId} terminée par {PlayerId} : {Status}, {RoundsPassed} manche(s) passée(s), score {TotalScore}")]
    public static partial void SessionEnded(ILogger logger, int sessionId, Guid playerId, RunSessionStatus status, int roundsPassed, int totalScore);

    [LoggerMessage(EventId = 1409, Level = LogLevel.Information, Message = "Partie {SessionId} abandonnée par {PlayerId}")]
    public static partial void SessionAbandoned(ILogger logger, int sessionId, Guid playerId);

    [LoggerMessage(EventId = 1410, Level = LogLevel.Warning,
        Message = "Extrait du morceau {TrackId} indisponible (Deezer n'a pas répondu) pour la partie {SessionId} : le joueur réessaiera")]
    public static partial void PreviewUnavailable(ILogger logger, int trackId, int sessionId);

    [LoggerMessage(EventId = 1411, Level = LogLevel.Error,
        Message = "Pas assez de morceaux jouables pour une playlist : {EligibleCount} sur {Requested}")]
    public static partial void PoolInsufficient(ILogger logger, int eligibleCount, int requested);

    [LoggerMessage(EventId = 1412, Level = LogLevel.Information,
        Message = "Partie {SessionId} de {PlayerId} : manche {Round} en {Difficulty}")]
    public static partial void DifficultyChosen(ILogger logger, int sessionId, Guid playerId, int round, string difficulty);

    [LoggerMessage(EventId = 1413, Level = LogLevel.Information,
        Message = "Partie {SessionId} de {PlayerId} : carte {Card} prise au palier de la manche {Round}")]
    public static partial void CardTaken(ILogger logger, int sessionId, Guid playerId, int round, string card);

    [LoggerMessage(EventId = 1414, Level = LogLevel.Information,
        Message = "Partie {SessionId} de {PlayerId} : carte {Card} jouée sur le morceau n°{TrackPosition}")]
    public static partial void CardPlayed(ILogger logger, int sessionId, Guid playerId, int trackPosition, string card);
}
