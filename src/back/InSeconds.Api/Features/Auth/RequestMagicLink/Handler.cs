using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Email;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Auth.RequestMagicLink;

public sealed class RequestMagicLinkHandler(
    ApplicationDbContext db,
    IMagicLinkTokenService magicLinkTokens,
    IEmailSender emailSender)
{
    private static readonly TimeSpan LoginValidity = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ThrottleWindow = TimeSpan.FromSeconds(60);

    public async Task<IResult> Handle(RequestMagicLinkCommand command, CancellationToken cancellationToken)
    {
        var email = command.Email.Trim().ToLowerInvariant();

        var isAllowed = await db.AllowedEmails.AnyAsync(a => a.Email == email, cancellationToken);
        if (!isAllowed)
            return Results.Ok(new RequestMagicLinkResponse());

        // Anti-spam simple : pas de nouveau token/email si un non-consommé a été
        // créé il y a moins de 60s pour cet email — réponse générique dans tous les cas.
        var throttleCutoff = DateTime.UtcNow.Subtract(ThrottleWindow);
        var recentlyRequested = await db.MagicLinkTokens
            .AnyAsync(m => m.Email == email && m.ConsumedAt == null && m.CreatedAt > throttleCutoff, cancellationToken);
        if (recentlyRequested)
            return Results.Ok(new RequestMagicLinkResponse());

        var magicLinkUrl = await magicLinkTokens.IssueAsync(email, LoginValidity, cancellationToken);
        var (subject, html) = MagicLinkEmailTemplate.Build(magicLinkUrl);
        await emailSender.SendAsync(email, subject, html, cancellationToken);

        return Results.Ok(new RequestMagicLinkResponse());
    }
}
