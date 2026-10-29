using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Application;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Modules.Players.Persistence;

/// <summary>
/// Deux personnes prennent le même pseudo, ou la même adresse, au même moment : les deux passent la
/// vérification préalable, l'index unique refuse la seconde à l'enregistrement. Réponse 409
/// <c>players.pseudo_taken</c> ou <c>players.email_taken</c>, comme la vérification préalable, au lieu
/// d'un 500 (erreur 23505). La transaction est déjà annulée : jeton
/// non consommé, pas de cookie (la réponse est vidée avant ce gestionnaire).
/// </summary>
internal sealed class AccountConflictExceptionHandler(IProblemDetailsService problemDetails)
    : UniqueViolationExceptionHandler(problemDetails, ProblemFor)
{
    internal static ProblemDetails? ProblemFor(Exception exception) =>
        ViolatedConstraint(exception) switch
        {
            AccountConfiguration.PseudoIndex => PlayersProblems.PseudoTaken(),
            AccountConfiguration.EmailIndex => PlayersProblems.EmailTaken(),
            _ => null,
        };
}
