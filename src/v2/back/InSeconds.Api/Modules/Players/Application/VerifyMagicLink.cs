using FluentValidation;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

/// <param name="Pseudo">Seulement pour créer un compte, à la seconde étape (<see cref="VerifyMagicLinkResponse.NeedsPseudo"/>).</param>
public sealed record VerifyMagicLink(string Token, string? Pseudo);

/// <param name="NeedsPseudo">
/// Pas encore de compte pour cette adresse : renvoyer le même jeton avec un pseudo. Le jeton n'est pas
/// consommé.
/// </param>
public sealed record VerifyMagicLinkResponse(bool NeedsPseudo);

public sealed class VerifyMagicLinkValidator : AbstractValidator<VerifyMagicLink>
{
    /// <summary>Liste de caractères permis plutôt que mots interdits, comme en v1 : 3 à 20 caractères.</summary>
    public const string PseudoPattern = @"^[\p{L}\p{N} _.-]{3,20}$";

    public VerifyMagicLinkValidator()
    {
        RuleFor(x => x.Token).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Pseudo)
            .Matches(PseudoPattern)
            .When(x => x.Pseudo is not null)
            .WithMessage("Le pseudo doit faire 3 à 20 caractères (lettres, chiffres, espace, _, . ou -).");
    }
}

/// <summary>Le jeton présenté, encore utilisable, et ce que la connexion fera.</summary>
public sealed record MagicLinkAttempt(AuthToken? Token, AccountSignInPlan? Plan);

/// <summary>
/// <c>POST /api/players/auth/magic-link/verify</c>. Seul ce <c>POST</c>, déclenché par le bouton
/// « Confirmer » du front, consomme le jeton : un scanner qui ouvre le lien de l'email ne le grille pas
/// (piège 21). Origine vérifiée d'abord (piège 22). Le jeton n'est consommé qu'une fois la connexion
/// faite : pas sur l'étape du pseudo, ni sur un pseudo déjà pris.
/// </summary>
public static class VerifyMagicLinkEndpoint
{
    public static ProblemDetails Before(HttpContext context, TrustedOrigins origins) =>
        origins.IsTrusted(context.Request) ? WolverineContinue.NoProblems : PlayersProblems.UntrustedOrigin();

    public static async Task<MagicLinkAttempt> LoadAsync(
        VerifyMagicLink request, IPlayerStore store, AccountSignIn accountSignIn, TimeProvider time, CancellationToken ct)
    {
        // Seulement un jeton de connexion : un jeton de changement d'email est refusé ici (S2).
        var token = await store.FindUsableTokenAsync(
            AuthTokenPurpose.Login, AuthTokenSecret.Hash(request.Token), time.GetUtcNow(), ct);
        return token is null
            ? new MagicLinkAttempt(null, null)
            : new MagicLinkAttempt(token, await accountSignIn.PrepareAsync(token.Email!, request.Pseudo, ct));
    }

    public static ProblemDetails Validate(MagicLinkAttempt attempt) => attempt switch
    {
        { Token: null } or { Plan.AccountUnavailable: true } => PlayersProblems.InvalidOrExpiredToken(),
        { Plan.PseudoTaken: true } => PlayersProblems.PseudoTaken(),
        _ => WolverineContinue.NoProblems,
    };

    [WolverinePost("/api/players/auth/magic-link/verify")]
    public static async Task<VerifyMagicLinkResponse> Post(
        VerifyMagicLink request,
        MagicLinkAttempt attempt,
        AccountSignIn accountSignIn,
        TimeProvider time,
        ILogger<VerifyMagicLink> logger,
        CancellationToken ct)
    {
        var plan = attempt.Plan!;
        if (plan.NeedsPseudo)
            return new VerifyMagicLinkResponse(NeedsPseudo: true);

        attempt.Token!.Consume(time.GetUtcNow());
        var result = await accountSignIn.ExecuteAsync(plan, ct);
        PlayersLog.SignedIn(logger, result.PlayerId, result.Outcome);
        return new VerifyMagicLinkResponse(NeedsPseudo: false);
    }
}
