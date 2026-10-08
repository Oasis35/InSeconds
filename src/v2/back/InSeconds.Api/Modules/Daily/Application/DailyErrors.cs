using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Problèmes du défi du jour, en <c>ProblemDetails</c> avec leur code (§ 5.6 du plan v2). Les codes sont dans <see cref="DailyErrorCodes"/>.</summary>
internal static class DailyProblems
{
    /// <summary>Pas de défi aujourd'hui : le pool ne suffit pas (503, comme la v1).</summary>
    public static ProblemDetails NoChallenge() =>
        ApiProblem.Of(StatusCodes.Status503ServiceUnavailable, DailyErrorCodes.NoChallenge, "Aucun défi disponible pour aujourd'hui.");

    public static ProblemDetails AlreadyPlayed() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, DailyErrorCodes.AlreadyPlayed, "Tu as déjà joué le défi du jour.");

    public static ProblemDetails Abandoned() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, DailyErrorCodes.Abandoned, "Tu as abandonné le défi du jour.");

    /// <summary>Une partie qui n'est plus en cours : terminée, ou abandonnée (par le bouton ou par l'expiration).</summary>
    public static ProblemDetails NotPending(SessionStatus status) =>
        status == SessionStatus.Completed ? AlreadyPlayed() : Abandoned();

    /// <summary>La partie d'un autre joueur répond comme une partie inconnue : rien n'en est révélé.</summary>
    public static ProblemDetails SessionNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, DailyErrorCodes.SessionNotFound, "Partie introuvable.");

    public static ProblemDetails TrackNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, DailyErrorCodes.TrackNotFound, "Morceau introuvable dans ce défi.");

    public static ProblemDetails AlreadyAnswered() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, DailyErrorCodes.AlreadyAnswered, "Ce morceau a déjà reçu sa réponse.");

    /// <summary>Piège 35 : le morceau en cours n'a pas reçu sa réponse, on ne passe pas à un autre.</summary>
    public static ProblemDetails TrackLockNotReleased() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, DailyErrorCodes.TrackLockNotReleased, "Le morceau en cours n'a pas encore reçu sa réponse.");

    public static ProblemDetails HintLocked(decimal unlockSeconds) =>
        ApiProblem.Of(StatusCodes.Status409Conflict, DailyErrorCodes.HintLocked, $"Cet indice se débloque après {unlockSeconds} s d'écoute.");

    public static ProblemDetails ListenedBelowMinimum() =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, DailyErrorCodes.ListenedBelowMinimum, "La durée annoncée est inférieure à la durée réellement écoutée sur ce morceau.");

    /// <summary>Pourquoi on ne peut pas agir sur ce morceau maintenant, ou rien si c'est le morceau en cours.</summary>
    public static ProblemDetails? ForTurn(TrackTurn turn) => turn switch
    {
        TrackTurn.Current => null,
        TrackTurn.AlreadyAnswered => AlreadyAnswered(),
        TrackTurn.NotYet => TrackLockNotReleased(),
        _ => TrackNotFound(),
    };
}

internal static partial class DailyLog
{
    [LoggerMessage(EventId = 1000, Level = LogLevel.Information,
        Message = "Partie {SessionId} démarrée par {PlayerId} (défi {DailyChallengeId})")]
    public static partial void SessionStarted(ILogger logger, int sessionId, Guid playerId, int dailyChallengeId);

    [LoggerMessage(EventId = 1001, Level = LogLevel.Information,
        Message = "Partie {SessionId} reprise par {PlayerId} ({AnsweredCount} réponse(s) déjà données)")]
    public static partial void SessionResumed(ILogger logger, int sessionId, Guid playerId, int answeredCount);

    // Jamais la réponse saisie : seulement le résultat, plus le morceau attendu (donnée publique du défi) pour lire les stats par morceau.
    [LoggerMessage(EventId = 1002, Level = LogLevel.Information,
        Message = "Réponse de {PlayerId} (partie {SessionId}, morceau n°{TrackPosition}) : palier {ListenedSeconds}s, artiste {ArtistCorrect}, titre {TitleCorrect}, indice {HintLevel}, score {Score} — {TrackArtist} / {TrackTitle}")]
    public static partial void AnswerSubmitted(
        ILogger logger, Guid playerId, int sessionId, int trackPosition, decimal listenedSeconds, bool artistCorrect, bool titleCorrect,
        int hintLevel, int score, string trackArtist, string trackTitle);

    [LoggerMessage(EventId = 1003, Level = LogLevel.Information,
        Message = "Partie {SessionId} terminée par {PlayerId} : score {TotalScore}")]
    public static partial void SessionCompleted(ILogger logger, int sessionId, Guid playerId, int totalScore);

    [LoggerMessage(EventId = 1004, Level = LogLevel.Information,
        Message = "Indice niveau {Level} demandé par {PlayerId} (partie {SessionId}, morceau n°{TrackPosition})")]
    public static partial void HintRequested(ILogger logger, int level, Guid playerId, int sessionId, int trackPosition);

    [LoggerMessage(EventId = 1005, Level = LogLevel.Information,
        Message = "Partie {SessionId} abandonnée par {PlayerId}")]
    public static partial void SessionAbandoned(ILogger logger, int sessionId, Guid playerId);

    [LoggerMessage(EventId = 1304, Level = LogLevel.Warning,
        Message = "Aucun défi pour le {Day} au démarrage d'une partie : génération à la volée.")]
    public static partial void GeneratingOnTheFly(ILogger logger, DateOnly day);

    [LoggerMessage(EventId = 1307, Level = LogLevel.Information, Message = "Statistiques du {Day} figées.")]
    public static partial void DayClosed(ILogger logger, DateOnly day);

    [LoggerMessage(EventId = 1308, Level = LogLevel.Error, Message = "Impossible de figer les statistiques du {Day}.")]
    public static partial void CloseDayFailed(ILogger logger, Exception exception, string day);

    [LoggerMessage(EventId = 1309, Level = LogLevel.Information, Message = "{Count} partie(s) en cours d'un défi d'avant le {Before} expirée(s).")]
    public static partial void StaleSessionsExpired(ILogger logger, int count, DateOnly before);

    [LoggerMessage(EventId = 1310, Level = LogLevel.Error, Message = "Impossible d'expirer les parties en cours des défis passés.")]
    public static partial void ExpireStaleSessionsFailed(ILogger logger, Exception exception);

    // Une erreur, comme le pool insuffisant : un réglage qui promet un indice que rien ne révèle doit alerter.
    [LoggerMessage(EventId = 1305, Level = LogLevel.Error,
        Message = "Daily:HintUnlockDurationsSeconds propose {Configured} niveaux d'indice, les fournisseurs en révèlent {Available} : les niveaux en trop sont ignorés.")]
    public static partial void HintLevelsBeyondProviders(ILogger logger, int configured, int available);

    [LoggerMessage(EventId = 1306, Level = LogLevel.Error,
        Message = "Daily:HintUnlockDurationsSeconds n'est pas strictement positif et croissant : les seuils par défaut sont utilisés.")]
    public static partial void InvalidHintThresholds(ILogger logger);
}
