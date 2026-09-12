using InSeconds.Api.Common.Auth;

namespace InSeconds.Api.Features.Auth.DevLogin;

// Réutilise exactement le chemin de code de VerifyMagicLink (AccountLinkingService +
// IssueCookie côté endpoint) — seule la vérification du token est court-circuitée.
public sealed class DevLoginHandler(IAccountLinkingService accountLinking)
{
    public async Task<DevLoginOutcome> Handle(DevLoginCommand command, CancellationToken cancellationToken)
    {
        var email = command.Email.Trim().ToLowerInvariant();

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
