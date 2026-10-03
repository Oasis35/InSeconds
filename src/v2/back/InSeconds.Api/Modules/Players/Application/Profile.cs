using FluentValidation;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using InSeconds.Api.Modules.Players.Email;
using InSeconds.Infrastructure.Email;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Wolverine.Attributes;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

public sealed record UpdatePseudo(string Pseudo);

public sealed record PseudoResponse(string Pseudo);

public sealed class UpdatePseudoValidator : AbstractValidator<UpdatePseudo>
{
    public UpdatePseudoValidator() =>
        RuleFor(x => x.Pseudo)
            .Matches(VerifyMagicLinkValidator.PseudoPattern)
            .WithMessage("Le pseudo doit faire 3 à 20 caractères (lettres, chiffres, espace, _, . ou -).");
}

/// <summary>Compte du joueur de la requête : <c>null</c> pour un invité (403 <c>players.guest_forbidden</c>).</summary>
internal static class CurrentAccount
{
    public static Task<Account?> LoadAsync(ICurrentPlayer current, IPlayerStore store, CancellationToken ct) =>
        current.PlayerId is { } playerId ? store.FindAccountAsync(playerId, ct) : Task.FromResult<Account?>(null);
}

public static class UpdatePseudoEndpoint
{
    public static Task<Account?> LoadAsync(ICurrentPlayer current, IPlayerStore store, CancellationToken ct) =>
        CurrentAccount.LoadAsync(current, store, ct);

    public static async Task<ProblemDetails> ValidateAsync(UpdatePseudo request, Account? account, IPlayerStore store, CancellationToken ct)
    {
        if (account is null)
            return PlayersProblems.GuestForbidden();
        // Le sien, même avec une autre casse, n'est pas « pris ».
        return await store.IsPseudoTakenByAnotherAsync(request.Pseudo, account.PlayerId, ct)
            ? PlayersProblems.PseudoTaken()
            : WolverineContinue.NoProblems;
    }

    /// <summary><c>PUT /api/players/me/pseudo</c> : comptes seulement. Pseudo pris au même moment : 409 aussi.</summary>
    [Authorize]
    [WolverinePut("/api/players/me/pseudo")]
    public static PseudoResponse Put(UpdatePseudo request, Account account)
    {
        account.Rename(request.Pseudo);
        return new PseudoResponse(account.Pseudo);
    }
}

public sealed record RequestEmailChange(string NewEmail);

public sealed class RequestEmailChangeValidator : AbstractValidator<RequestEmailChange>
{
    public RequestEmailChangeValidator() =>
        RuleFor(x => x.NewEmail).NotEmpty().EmailAddress().MaximumLength(256);
}

/// <summary>
/// Envoi de la confirmation d'un changement d'adresse, par l'outbox. Comme pour la connexion (S1), le
/// message ne porte pas le jeton : son handler le génère.
/// </summary>
[MessageIdentity("players.send-email-change-confirmation")]
public sealed record SendEmailChangeConfirmation(Guid PlayerId, string NewEmail);

public static class RequestEmailChangeEndpoint
{
    public static Task<Account?> LoadAsync(ICurrentPlayer current, IPlayerStore store, CancellationToken ct) =>
        CurrentAccount.LoadAsync(current, store, ct);

    public static async Task<ProblemDetails> ValidateAsync(RequestEmailChange request, Account? account, IPlayerStore store, CancellationToken ct)
    {
        if (account is null)
            return PlayersProblems.GuestForbidden();

        var newEmail = RequestMagicLinkEndpoint.NormalizeEmail(request.NewEmail);
        if (string.Equals(newEmail, account.Email, StringComparison.OrdinalIgnoreCase))
            return PlayersProblems.SameEmail();
        return await store.FindAccountByEmailAsync(newEmail, ct) is { } owner && owner.PlayerId != account.PlayerId
            ? PlayersProblems.EmailTaken()
            : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>POST /api/players/me/email-change</c> : comptes seulement, 204. Le lien part à la nouvelle
    /// adresse seulement (v1). Limité par joueur (S11), et un lien par minute.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/players/me/email-change")]
    [EnableRateLimiting(RateLimitPolicies.EmailChangeRequest)]
    [EmptyResponse]
    public static SendEmailChangeConfirmation Post(RequestEmailChange request, Account account) =>
        new(account.PlayerId, RequestMagicLinkEndpoint.NormalizeEmail(request.NewEmail));
}

public static class SendEmailChangeConfirmationHandler
{
    /// <summary>Génère le jeton, enregistre son hash et envoie l'email, dans la transaction du message.</summary>
    public static async Task Handle(
        SendEmailChangeConfirmation message,
        IPlayerStore store,
        IEmailComposer<ConfirmEmailChangeEmail> composer,
        IEmailSender sender,
        IOptions<AppOptions> app,
        TimeProvider time,
        CancellationToken ct)
    {
        var now = time.GetUtcNow();
        if (await store.HasTokenIssuedForPlayerSinceAsync(AuthTokenPurpose.EmailChange, message.PlayerId, now - SendMagicLinkEmailHandler.Throttle, ct))
            return;

        var rawToken = AuthTokenSecret.Generate();
        store.Add(AuthToken.IssueEmailChange(message.PlayerId, message.NewEmail, AuthTokenSecret.Hash(rawToken), now));

        var email = composer.Compose(new ConfirmEmailChangeEmail(
            app.Value.Link($"/account/confirm-email?token={rawToken}"), message.NewEmail));
        await sender.SendAsync(message.NewEmail, email.Subject, email.HtmlBody, ct);
    }
}

public sealed record ConfirmEmailChange(string Token);

public sealed record EmailChangedResponse(string Email);

public sealed class ConfirmEmailChangeValidator : AbstractValidator<ConfirmEmailChange>
{
    public ConfirmEmailChangeValidator() => RuleFor(x => x.Token).NotEmpty().MaximumLength(100);
}

/// <summary>Le jeton présenté, le compte qu'il concerne, et l'adresse convoitée déjà prise entre-temps.</summary>
public sealed record EmailChangeAttempt(AuthToken? Token, Account? Account, bool EmailTaken);

public static class ConfirmEmailChangeEndpoint
{
    public static async Task<EmailChangeAttempt> LoadAsync(ConfirmEmailChange request, IPlayerStore store, TimeProvider time, CancellationToken ct)
    {
        // Seulement un jeton de changement d'email : un jeton de connexion est refusé ici (S2).
        var token = await store.FindUsableTokenAsync(AuthTokenPurpose.EmailChange, AuthTokenSecret.Hash(request.Token), time.GetUtcNow(), ct);
        if (token is null)
            return new EmailChangeAttempt(null, null, false);

        var account = await store.FindAccountAsync(token.PlayerId!.Value, ct);
        var taken = await store.FindAccountByEmailAsync(token.NewEmail!, ct) is { } owner && owner.PlayerId != token.PlayerId;
        return new EmailChangeAttempt(token, account, taken);
    }

    public static ProblemDetails Validate(EmailChangeAttempt attempt) => attempt switch
    {
        { Token: null } or { Account: null } => PlayersProblems.InvalidOrExpiredToken(),
        // Prise entre la demande et la confirmation : jeton gardé, la demande reste ouverte (v1).
        { EmailTaken: true } => PlayersProblems.EmailTaken(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>POST /api/players/email-change/confirm</c> : public, l'autorisation tient au jeton secret à usage
    /// unique (aucun cookie posé, d'où pas de contrôle d'origine, comme en v1). Bouton « Confirmer »
    /// explicite côté front (piège 21).
    /// </summary>
    [WolverinePost("/api/players/email-change/confirm")]
    public static EmailChangedResponse Post(ConfirmEmailChange request, EmailChangeAttempt attempt, TimeProvider time)
    {
        attempt.Token!.Consume(time.GetUtcNow());
        attempt.Account!.ChangeEmail(attempt.Token.NewEmail!);
        return new EmailChangedResponse(attempt.Account.Email);
    }
}
