using Microsoft.AspNetCore.Mvc;

namespace InSeconds.Api.Infrastructure.Errors;

/// <summary>
/// Une erreur métier en <c>ProblemDetails</c>, avec son <c>code</c> stable (le <c>traceId</c> est ajouté
/// par <see cref="ProblemDetailsSetup"/>). Renvoyée par une méthode <c>Validate</c> d'un endpoint
/// Wolverine.Http, elle arrête la requête avant <c>Handle</c>.
/// </summary>
public static class ApiProblem
{
    public static ProblemDetails Of(int status, string code, string title) =>
        new() { Status = status, Title = title, Extensions = { ["code"] = code } };
}
