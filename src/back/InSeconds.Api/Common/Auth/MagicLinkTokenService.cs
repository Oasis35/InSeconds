using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;

namespace InSeconds.Api.Common.Auth;

public interface IMagicLinkTokenService
{
    Task<string> IssueAsync(string email, TimeSpan validity, CancellationToken ct = default);
}

// Commun à RequestMagicLink (self-service, 15 min) et AddAllowedEmail (invitation
// automatique, 7 jours) — même mécanisme de génération/hash/stockage, seule la durée
// de vie diffère selon le contexte d'émission (cf. plan).
public sealed class MagicLinkTokenService(ApplicationDbContext db, IConfiguration configuration) : IMagicLinkTokenService
{
    public async Task<string> IssueAsync(string email, TimeSpan validity, CancellationToken ct = default)
    {
        var rawToken = MagicLinkTokenGenerator.GenerateRawToken();

        db.MagicLinkTokens.Add(new MagicLinkToken
        {
            Email     = email,
            TokenHash = MagicLinkTokenGenerator.Hash(rawToken),
            ExpiresAt = DateTime.UtcNow.Add(validity),
            CreatedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync(ct);

        var publicUrl = configuration["App:PublicUrl"];
        return $"{publicUrl}/login/verify?token={rawToken}";
    }
}
