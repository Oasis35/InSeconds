using FluentValidation;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Modules.Players.Domain;
using InSeconds.Api.Modules.Players.Email;
using InSeconds.Infrastructure.Email;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Wolverine.Attributes;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

public sealed record RequestMagicLink(string Email);

public sealed class RequestMagicLinkValidator : AbstractValidator<RequestMagicLink>
{
    public RequestMagicLinkValidator() =>
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
}

/// <summary>
/// Envoi d'un lien de connexion, par l'outbox : une panne de Brevo ne perd pas la demande. Le message
/// ne porte que l'adresse, jamais le jeton (S1) : c'est son handler qui le génère.
/// </summary>
[MessageIdentity("players.send-magic-link-email")]
public sealed record SendMagicLinkEmail(string Email);

public static class RequestMagicLinkEndpoint
{
    /// <summary>
    /// <c>POST /api/players/auth/magic-link</c> : toujours 204, que l'adresse ait un compte ou non (pas
    /// d'énumération). Inscription ouverte : toute adresse reçoit un lien. Limité par IP (« email
    /// bombing »), en plus d'un lien par minute et par adresse.
    /// </summary>
    [WolverinePost("/api/players/auth/magic-link")]
    [EnableRateLimiting(RateLimitPolicies.MagicLinkRequest)]
    [EmptyResponse]
    public static SendMagicLinkEmail Post(RequestMagicLink request) => new(NormalizeEmail(request.Email));

    internal static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}

public static class SendMagicLinkEmailHandler
{
    /// <summary>Pas de nouveau lien si un autre, non utilisé, est parti il y a moins d'une minute (v1).</summary>
    public static readonly TimeSpan Throttle = TimeSpan.FromSeconds(60);

    /// <summary>
    /// Génère le jeton, enregistre son hash et envoie l'email (S1). Un réessai produit un nouveau jeton :
    /// sans danger, l'ancien n'a pas été enregistré si l'envoi a échoué.
    /// </summary>
    public static async Task Handle(
        SendMagicLinkEmail message,
        IPlayerStore store,
        IEmailComposer<MagicLinkEmail> composer,
        IEmailSender sender,
        IOptions<AppOptions> app,
        TimeProvider time,
        CancellationToken ct)
    {
        var now = time.GetUtcNow();
        if (await store.HasTokenIssuedSinceAsync(AuthTokenPurpose.Login, message.Email, now - Throttle, ct))
            return;

        var rawToken = AuthTokenSecret.Generate();
        store.Add(AuthToken.IssueLogin(message.Email, AuthTokenSecret.Hash(rawToken), now));

        var email = composer.Compose(new MagicLinkEmail(app.Value.Link($"/account/login/verify?token={rawToken}")));
        await sender.SendAsync(message.Email, email.Subject, email.HtmlBody, ct);
    }
}
