using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Email;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Auth.RequestEmailChange;

public sealed class RequestEmailChangeHandler(
    ApplicationDbContext db,
    IEmailChangeTokenService emailChangeTokens,
    IEmailSender emailSender)
{
    private static readonly TimeSpan ChangeValidity = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ThrottleWindow = TimeSpan.FromSeconds(60);

    public async Task<IResult> Handle(RequestEmailChangeCommand command, CancellationToken cancellationToken)
    {
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == command.PlayerId, cancellationToken);
        if (player is null)
            return Results.NotFound();

        if (player.IsGuest)
            return Results.StatusCode(StatusCodes.Status403Forbidden);

        var newEmail = command.NewEmail.Trim().ToLowerInvariant();

        if (newEmail == player.Email)
            return Results.BadRequest(new { error = "same_email", message = "C'est déjà ton adresse actuelle." });

        var emailTaken = await db.Players.AnyAsync(p => p.Email == newEmail && p.Id != command.PlayerId, cancellationToken);
        if (emailTaken)
            return Results.Conflict(new { error = "email_taken", message = "Cette adresse est déjà utilisée par un autre compte." });

        // Anti-spam simple : pas de nouveau token/email si un non-consommé a été
        // créé il y a moins de 60s pour ce joueur — réponse générique dans tous les cas
        // (mirroring RequestMagicLinkHandler).
        var throttleCutoff = DateTime.UtcNow.Subtract(ThrottleWindow);
        var recentlyRequested = await db.EmailChangeTokens
            .AnyAsync(t => t.PlayerId == command.PlayerId && t.ConsumedAt == null && t.CreatedAt > throttleCutoff, cancellationToken);
        if (recentlyRequested)
            return Results.Ok(new RequestEmailChangeResponse());

        var confirmUrl = await emailChangeTokens.IssueAsync(command.PlayerId, newEmail, ChangeValidity, cancellationToken);
        var (subject, html) = ConfirmEmailChangeEmailTemplate.Build(confirmUrl, newEmail);
        await emailSender.SendAsync(newEmail, subject, html, cancellationToken);

        return Results.Ok(new RequestEmailChangeResponse());
    }
}
