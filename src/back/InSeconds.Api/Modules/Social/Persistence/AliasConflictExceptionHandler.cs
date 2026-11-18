using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Social.Application;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Modules.Social.Persistence;

/// <summary>
/// Deux tirages donnent le même alias au même instant malgré le verrou des tirages : l'index unique refuse le second à l'enregistrement. Réponse 409
/// <c>social.alias_taken</c> au lieu d'un 500 (erreur 23505) ; le joueur tire un autre alias.
/// </summary>
internal sealed class AliasConflictExceptionHandler(IProblemDetailsService problemDetails)
    : UniqueViolationExceptionHandler(problemDetails, ProblemFor)
{
    internal static ProblemDetails? ProblemFor(Exception exception) =>
        ViolatedConstraint(exception) == RankingIdentityConfiguration.AliasIndex ? SocialProblems.AliasTaken() : null;
}
