using InSeconds.Api.Common.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Auth.DevLogin;

// Réutilise exactement le chemin de code de VerifyMagicLink (AccountLinkingService +
// IssueCookie côté endpoint) — seule la vérification du token est court-circuitée.
// Garde-fou même en dev : Email doit être dans AllowedEmails (pas de création
// arbitraire).
public sealed class DevLoginHandler(ApplicationDbContext db, IAccountLinkingService accountLinking)
{
    public async Task<DevLoginOutcome> Handle(DevLoginCommand command, CancellationToken cancellationToken)
    {
        var email = command.Email.Trim().ToLowerInvariant();

        var isAllowed = await db.AllowedEmails.AnyAsync(a => a.Email == email, cancellationToken);
        if (!isAllowed)
        {
            return new DevLoginOutcome(
                Results.NotFound(new { error = "not_allowed", message = "Email non whitelisté." }),
                AuthTokenToIssue: null);
        }

        var link = await accountLinking.ResolveOrLinkAsync(email, command.CurrentGuestPlayerId, pseudo: null, cancellationToken);

        if (link.Outcome == LinkOutcome.NeedsPseudo)
        {
            return new DevLoginOutcome(
                Results.UnprocessableEntity(new { error = "needs_pseudo", message = "Compte de test non seedé correctement (pseudo manquant)." }),
                AuthTokenToIssue: null);
        }

        return new DevLoginOutcome(Results.Ok(), link.AuthToken);
    }
}
