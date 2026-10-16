using System.Text.RegularExpressions;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Application;

namespace InSeconds.Api.Testing.Auth;

/// <param name="Pseudo">Seulement pour créer le compte, si l'adresse n'en a pas encore.</param>
public sealed record DevLoginRequest(string Email, string? Pseudo);

/// <summary>
/// <c>POST /api/auth/dev-login</c> : se connecter sans email, en développement local et en E2E. Même
/// chemin que la vérification du lien magique (<see cref="AccountSignIn"/>), sans le jeton : mêmes
/// réponses (<c>needsPseudo</c>, pseudo pris), nouvelle session et ancienne révoquée. Servi par l'hôte
/// de test seulement, jamais par l'image de prod (S9).
/// </summary>
public static class DevLoginEndpoints
{
    public const string Route = "/api/auth/dev-login";

    public static IEndpointRouteBuilder MapDevLogin(this IEndpointRouteBuilder routes)
    {
        routes.MapPost(Route, async (DevLoginRequest request, AccountSignIn accountSignIn, InSecondsDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email)
                || (request.Pseudo is not null && !Regex.IsMatch(request.Pseudo, VerifyMagicLinkValidator.PseudoPattern)))
                return Problem(ApiProblem.Of(StatusCodes.Status400BadRequest, ErrorCodes.BadRequest, "Adresse ou pseudo invalide."));

            var plan = await accountSignIn.PrepareAsync(RequestMagicLinkEndpoint.NormalizeEmail(request.Email), request.Pseudo, ct);
            if (plan.AccountUnavailable)
                return Problem(PlayersProblems.InvalidOrExpiredToken());
            if (plan.PseudoTaken)
                return Problem(PlayersProblems.PseudoTaken());
            if (plan.NeedsPseudo)
                return Results.Ok(new VerifyMagicLinkResponse(NeedsPseudo: true));

            // Hors de Wolverine : pas de transaction automatique. Le gel offert à la création du compte prend un verrou, qui en exige une.
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await accountSignIn.ExecuteAsync(plan, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(new VerifyMagicLinkResponse(NeedsPseudo: false));
        }).ExcludeFromDescription();

        return routes;
    }

    private static IResult Problem(Microsoft.AspNetCore.Mvc.ProblemDetails problem) => Results.Problem(problem);
}
