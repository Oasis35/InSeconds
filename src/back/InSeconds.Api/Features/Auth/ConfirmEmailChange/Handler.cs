using InSeconds.Api.Common.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Features.Auth.ConfirmEmailChange;

public sealed class ConfirmEmailChangeHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(ConfirmEmailChangeCommand command, CancellationToken cancellationToken)
    {
        var tokenHash = MagicLinkTokenGenerator.Hash(command.Token);
        var token = await db.EmailChangeTokens
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, cancellationToken);

        if (token is null || token.ConsumedAt is not null || token.ExpiresAt <= DateTime.UtcNow)
        {
            return Results.BadRequest(new { error = "invalid_or_expired_token", message = "Lien invalide ou expiré." });
        }

        // Course avec un autre changement d'email pris entre-temps par un autre joueur —
        // vérifiée avant le save (le catch ci-dessous reste un filet de sécurité si la
        // course est trop serrée pour ce check). Token non consommé dans ce cas : la
        // demande initiale reste ouverte, le joueur peut réessayer avec une autre adresse.
        var emailTaken = await db.Players.AnyAsync(p => p.Email == token.NewEmail && p.Id != token.PlayerId, cancellationToken);
        if (emailTaken)
            return Results.Conflict(new { error = "email_taken", message = "Cette adresse est désormais utilisée par un autre compte." });

        var player = await db.Players.FirstAsync(p => p.Id == token.PlayerId, cancellationToken);
        player.ChangeEmail(token.NewEmail);
        token.ConsumedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            return Results.Conflict(new { error = "email_taken", message = "Cette adresse est désormais utilisée par un autre compte." });
        }

        return Results.Ok(new ConfirmEmailChangeResponse(player.Email!));
    }
}
