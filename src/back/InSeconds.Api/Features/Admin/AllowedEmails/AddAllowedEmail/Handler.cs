using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Email;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Features.Admin.AllowedEmails.AddAllowedEmail;

public sealed class AddAllowedEmailHandler(
    ApplicationDbContext db,
    IMagicLinkTokenService magicLinkTokens,
    IEmailSender emailSender,
    ILogger<AddAllowedEmailHandler> logger)
{
    private static readonly TimeSpan InvitationValidity = TimeSpan.FromDays(7);

    public async Task<IResult> Handle(AddAllowedEmailCommand command, CancellationToken cancellationToken)
    {
        var email = command.Email.Trim().ToLowerInvariant();

        var allowedEmail = new AllowedEmail
        {
            Email     = email,
            CreatedAt = DateTime.UtcNow,
        };
        db.AllowedEmails.Add(allowedEmail);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            return Results.Conflict(new { error = "already_allowed", message = "Cet email est déjà autorisé." });
        }

        // L'invitation part automatiquement — aucune étape supplémentaire pour l'admin.
        // Échec d'envoi = warning loggé, ne fait jamais échouer l'ajout à la whitelist
        // (SMTP momentanément indisponible ne doit pas bloquer l'action principale).
        try
        {
            var magicLinkUrl = await magicLinkTokens.IssueAsync(email, InvitationValidity, cancellationToken);
            var (subject, html) = WhitelistInvitationEmailTemplate.Build(magicLinkUrl);
            await emailSender.SendAsync(email, subject, html, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Échec de l'envoi de l'email d'invitation à {Email}", email);
        }

        return Results.Ok(new AddAllowedEmailResponse(allowedEmail.Id, allowedEmail.Email));
    }
}
