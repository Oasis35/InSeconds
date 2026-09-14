using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;

namespace InSeconds.Api.Common.Auth;

public interface IEmailChangeTokenService
{
    Task<string> IssueAsync(Guid playerId, string newEmail, TimeSpan validity, CancellationToken ct = default);
}

public sealed class EmailChangeTokenService(ApplicationDbContext db, IConfiguration configuration) : IEmailChangeTokenService
{
    public async Task<string> IssueAsync(Guid playerId, string newEmail, TimeSpan validity, CancellationToken ct = default)
    {
        var rawToken = MagicLinkTokenGenerator.GenerateRawToken();

        db.EmailChangeTokens.Add(new EmailChangeToken
        {
            PlayerId  = playerId,
            NewEmail  = newEmail,
            TokenHash = MagicLinkTokenGenerator.Hash(rawToken),
            ExpiresAt = DateTime.UtcNow.Add(validity),
            CreatedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync(ct);

        var publicUrl = configuration["App:PublicUrl"];
        return $"{publicUrl}/profile/confirm-email?token={rawToken}";
    }
}
