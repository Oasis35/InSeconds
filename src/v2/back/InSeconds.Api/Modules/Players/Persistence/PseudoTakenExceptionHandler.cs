using InSeconds.Api.Modules.Players.Application;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Modules.Players.Persistence;

/// <summary>
/// Deux personnes créent le même pseudo au même moment : les deux passent la vérification préalable,
/// l'index unique refuse la seconde à l'enregistrement. Réponse 409 <c>players.pseudo_taken</c>, comme
/// la vérification préalable, au lieu d'un 500 (v1 : erreur 23505 interceptée dans
/// <c>VerifyMagicLinkHandler</c>). La transaction est déjà annulée : jeton non consommé, pas de cookie
/// (la réponse est vidée avant ce gestionnaire).
/// </summary>
internal sealed class PseudoTakenExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (!IsPseudoTaken(exception))
            return false;

        var problem = PlayersProblems.PseudoTaken();
        httpContext.Response.StatusCode = problem.Status!.Value;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    internal static bool IsPseudoTaken(Exception exception) =>
        exception is DbUpdateException
        {
            InnerException: PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: AccountConfiguration.PseudoIndex,
            },
        };
}
