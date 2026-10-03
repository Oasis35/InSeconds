using InSeconds.Api.Infrastructure.Errors;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>Codes d'erreur du module Players (§ 5.6 du plan v2). Ne jamais renommer un code publié.</summary>
public static class PlayersErrorCodes
{
    public const string InvalidOrExpiredToken = "players.invalid_or_expired_token";
    public const string PseudoTaken = "players.pseudo_taken";
}

internal static class PlayersProblems
{
    public static ProblemDetails InvalidOrExpiredToken() =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, PlayersErrorCodes.InvalidOrExpiredToken, "Lien invalide ou expiré.");

    public static ProblemDetails PseudoTaken() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, PlayersErrorCodes.PseudoTaken, "Ce pseudo est déjà pris.");

    public static ProblemDetails UntrustedOrigin() =>
        ApiProblem.Of(StatusCodes.Status403Forbidden, ErrorCodes.Forbidden, "Origine de la requête non reconnue.");
}

/// <summary>
/// Événements du parcours joueur du module, mêmes identifiants et messages qu'en v1
/// (<c>PlayerActionLog</c>) : les tableaux de bord existants restent valables. Jamais d'email ni de pseudo.
/// </summary>
internal static partial class PlayersLog
{
    [LoggerMessage(EventId = 1006, Level = LogLevel.Information,
        Message = "Connexion par magic link : {PlayerId} ({LinkOutcome})")]
    public static partial void SignedIn(ILogger logger, Guid playerId, string linkOutcome);
}
