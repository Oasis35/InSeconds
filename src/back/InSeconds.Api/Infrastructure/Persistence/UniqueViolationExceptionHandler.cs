using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Infrastructure.Persistence;

/// <summary>
/// Base des gestionnaires qui traduisent une violation d'unicité PostgreSQL (23505) en 409 : deux écritures concurrentes passent
/// la vérification préalable, l'index unique refuse la seconde à l'enregistrement. Chaque module fournit <c>problemFor</c>, qui
/// reconnaît ses propres contraintes (<see cref="ViolatedConstraint"/>) et rend <c>null</c> pour toutes les autres : l'exception
/// passe alors au gestionnaire suivant (500).
/// </summary>
internal abstract class UniqueViolationExceptionHandler(IProblemDetailsService problemDetails, Func<Exception, ProblemDetails?> problemFor)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problem = problemFor(exception);
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

    /// <summary>Le nom de la contrainte d'unicité refusée à l'enregistrement, <c>null</c> pour toute autre exception.</summary>
    protected static string? ViolatedConstraint(Exception exception) =>
        exception is DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } violation }
            ? violation.ConstraintName
            : null;
}
