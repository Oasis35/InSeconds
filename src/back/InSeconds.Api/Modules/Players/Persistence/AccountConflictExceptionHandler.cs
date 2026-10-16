using InSeconds.Api.Modules.Players.Application;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Modules.Players.Persistence;

/// <summary>
/// Deux personnes prennent le même pseudo, ou la même adresse, au même moment : les deux passent la
/// vérification préalable, l'index unique refuse la seconde à l'enregistrement. Réponse 409
/// <c>players.pseudo_taken</c> ou <c>players.email_taken</c>, comme la vérification préalable, au lieu
/// d'un 500 (v1 : erreur 23505 interceptée dans les handlers). La transaction est déjà annulée : jeton
/// non consommé, pas de cookie (la réponse est vidée avant ce gestionnaire).
/// </summary>
internal sealed class AccountConflictExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problem = ProblemFor(exception);
        if (problem is null)
            return false;

        httpContext.Response.StatusCode = problem.Status!.Value;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    internal static ProblemDetails? ProblemFor(Exception exception) =>
        exception is DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } unique }
            ? unique.ConstraintName switch
            {
                AccountConfiguration.PseudoIndex => PlayersProblems.PseudoTaken(),
                AccountConfiguration.EmailIndex => PlayersProblems.EmailTaken(),
                _ => null,
            }
            : null;
}
