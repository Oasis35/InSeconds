using InSeconds.Api.Common.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Features.Auth.VerifyMagicLink;

public sealed class VerifyMagicLinkHandler(ApplicationDbContext db, IAccountLinkingService accountLinking)
{
    public async Task<VerifyMagicLinkOutcome> Handle(VerifyMagicLinkCommand command, CancellationToken cancellationToken)
    {
        var tokenHash = MagicLinkTokenGenerator.Hash(command.Token);
        var token = await db.MagicLinkTokens
            .FirstOrDefaultAsync(m => m.TokenHash == tokenHash, cancellationToken);

        if (token is null || token.ConsumedAt is not null || token.ExpiresAt <= DateTime.UtcNow)
        {
            return new VerifyMagicLinkOutcome(
                Results.BadRequest(new { error = "invalid_or_expired_token", message = "Lien invalide ou expiré." }),
                AuthTokenToIssue: null);
        }

        LinkResult link;
        try
        {
            link = await accountLinking.ResolveOrLinkAsync(token.Email, command.CurrentGuestPlayerId, command.Pseudo, cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // Pseudo déjà pris — le token n'est PAS consommé : le front peut réessayer
            // avec un pseudo différent en renvoyant le même token.
            return new VerifyMagicLinkOutcome(
                Results.Conflict(new { error = "pseudo_taken", message = "Ce pseudo est déjà pris." }),
                AuthTokenToIssue: null);
        }

        if (link.Outcome == LinkOutcome.NeedsPseudo)
        {
            // Résolution pas terminée : le token reste valide pour le prochain appel
            // (avec le pseudo rempli) — cf. plan, point critique sur l'ordre de
            // consommation du token.
            return new VerifyMagicLinkOutcome(Results.Ok(new VerifyMagicLinkResponse(NeedsPseudo: true)), AuthTokenToIssue: null);
        }

        // Found ou Linked : résolution terminée, le token est désormais consommé.
        token.ConsumedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return new VerifyMagicLinkOutcome(Results.Ok(new VerifyMagicLinkResponse(NeedsPseudo: false)), link.AuthToken);
    }
}
