using InSeconds.Api.Infrastructure.Errors;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>Codes d'erreur du module Players (§ 5.6 du plan v2). Ne jamais renommer un code publié.</summary>
public static class PlayersErrorCodes
{
    public const string InvalidOrExpiredToken = "players.invalid_or_expired_token";
    public const string PseudoTaken = "players.pseudo_taken";
    public const string EmailTaken = "players.email_taken";
    public const string SameEmail = "players.same_email";
    public const string GuestForbidden = "players.guest_forbidden";
}

internal static class PlayersProblems
{
    public static ProblemDetails InvalidOrExpiredToken() =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, PlayersErrorCodes.InvalidOrExpiredToken, "Lien invalide ou expiré.");

    public static ProblemDetails PseudoTaken() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, PlayersErrorCodes.PseudoTaken, "Ce pseudo est déjà pris.");

    public static ProblemDetails EmailTaken() =>
        ApiProblem.Of(StatusCodes.Status409Conflict, PlayersErrorCodes.EmailTaken, "Cette adresse est déjà utilisée par un autre compte.");

    public static ProblemDetails SameEmail() =>
        ApiProblem.Of(StatusCodes.Status400BadRequest, PlayersErrorCodes.SameEmail, "C'est déjà ton adresse actuelle.");

    /// <summary>Réservé aux comptes : un invité n'a ni pseudo ni adresse.</summary>
    public static ProblemDetails GuestForbidden() =>
        ApiProblem.Of(StatusCodes.Status403Forbidden, PlayersErrorCodes.GuestForbidden, "Réservé aux comptes.");

    public static ProblemDetails DeviceNotFound() =>
        ApiProblem.Of(StatusCodes.Status404NotFound, ErrorCodes.NotFound, "Appareil introuvable.");

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
