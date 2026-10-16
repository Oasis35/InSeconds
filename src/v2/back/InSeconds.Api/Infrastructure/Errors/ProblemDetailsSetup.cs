using System.Diagnostics;
using Microsoft.AspNetCore.Http.Features;

namespace InSeconds.Api.Infrastructure.Errors;

/// <summary>
/// Toutes les erreurs de l'API sortent au même format : <c>application/problem+json</c> avec un
/// <c>code</c> stable et un <c>traceId</c>, le code d'erreur affiché au joueur et recherchable dans
/// les journaux. Une erreur 500 ne contient jamais le message ni la pile de l'exception (S12) :
/// ils restent dans les journaux.
/// </summary>
public static class ProblemDetailsSetup
{
    public const string UnexpectedTitle = "An unexpected error occurred.";

    public static IServiceCollection AddInSecondsProblemDetails(this IServiceCollection services) =>
        services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
        {
            var problem = context.ProblemDetails;
            var status = problem.Status ?? context.HttpContext.Response.StatusCode;

            if (!problem.Extensions.ContainsKey("code"))
                problem.Extensions["code"] = ErrorCodes.ForStatus(status);

            problem.Extensions["traceId"] = CurrentTraceId(context.HttpContext);
            problem.Extensions.Remove("requestId");

            if (status >= StatusCodes.Status500InternalServerError)
            {
                problem.Title = UnexpectedTitle;
                problem.Detail = null;
                problem.Extensions.Remove("exception");
            }
        });

    public static WebApplication UseInSecondsErrorHandling(this WebApplication app)
    {
        app.UseExceptionHandler();
        // Réponses d'erreur sans corps (404 d'une route inconnue, 405…) : même format.
        app.UseStatusCodePages();
        return app;
    }

    /// <summary>
    /// Identifiant de trace W3C (32 caractères hexadécimaux) de la requête, celui que les traces
    /// OpenTelemetry porteront. À défaut d'activité, l'identifiant de requête d'ASP.NET Core.
    /// </summary>
    public static string CurrentTraceId(HttpContext httpContext) =>
        httpContext.Features.Get<IHttpActivityFeature>()?.Activity.TraceId.ToHexString()
        ?? Activity.Current?.TraceId.ToHexString()
        ?? httpContext.TraceIdentifier;
}
