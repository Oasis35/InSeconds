using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.AllowedEmails.RemoveAllowedEmail;

// Ne supprime que l'entrée AllowedEmails — n'affecte jamais le Player éventuellement
// déjà lié à cet email (limitation acceptée : n'empêche qu'une future reconnexion,
// ne révoque pas une session déjà active, cf. plan).
public sealed class RemoveAllowedEmailHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(RemoveAllowedEmailCommand command, CancellationToken cancellationToken)
    {
        var allowedEmail = await db.AllowedEmails
            .FirstOrDefaultAsync(a => a.Id == command.Id, cancellationToken);

        if (allowedEmail is null)
            return Results.NotFound(new { error = "not_found", message = "Email introuvable dans la whitelist." });

        db.AllowedEmails.Remove(allowedEmail);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok();
    }
}
