using InSeconds.Api.Modules.Catalogue.Application;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

/// <summary>
/// Deux ajouts (ou une actualisation et un ajout) du même identifiant Deezer au même moment : les deux passent
/// la vérification préalable, l'index unique refuse le second à l'enregistrement. Réponse 409
/// <c>catalogue.duplicate_deezer_id</c>, comme la vérification préalable, au lieu d'un 500. Deux ajouts (ou une actualisation et un ajout) qui écrivent en même temps le même genre neuf (album partagé) : le second est refusé sur la clé
/// du genre, 409 <c>catalogue.concurrent_add</c> (« réessaie »). La transaction est déjà annulée.
/// </summary>
internal sealed class TrackConflictExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
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
        exception is DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } violation }
            ? violation.ConstraintName switch
            {
                TrackConfiguration.DeezerIdIndex => CatalogueProblems.DuplicateDeezerId(),
                GenreConfiguration.PrimaryKey => CatalogueProblems.ConcurrentAdd(),
                _ => null,
            }
            : null;
}
