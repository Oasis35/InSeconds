using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Common.Auth;

public enum LinkOutcome
{
    // Player existant avec cet email → juste se connecter dessus (reconnexion, autre appareil ou même)
    Found,

    // Pas de Player pour cet email → il faut un pseudo avant de convertir le guest courant
    NeedsPseudo,

    // Conversion effectuée, prêt à poser le cookie
    Linked,
}

public sealed record LinkResult(LinkOutcome Outcome, Guid PlayerId, Guid AuthToken);

public interface IAccountLinkingService
{
    Task<LinkResult> ResolveOrLinkAsync(string email, Guid currentGuestPlayerId, string? pseudo, CancellationToken ct = default);
}

// Logique partagée "email vérifié → compte", indépendante du moyen de vérification
// (magic link aujourd'hui, Google OAuth demain — même point d'entrée, la clé de
// résolution de compte est l'email dans les deux cas).
public sealed class AccountLinkingService(ApplicationDbContext db) : IAccountLinkingService
{
    public async Task<LinkResult> ResolveOrLinkAsync(string email, Guid currentGuestPlayerId, string? pseudo, CancellationToken ct = default)
    {
        var existing = await db.Players.FirstOrDefaultAsync(p => p.Email == email, ct);

        if (existing is not null)
        {
            existing.LastSeenAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return new LinkResult(LinkOutcome.Found, existing.Id, existing.AuthToken);
        }

        if (string.IsNullOrWhiteSpace(pseudo))
        {
            var guest = await db.Players.FirstAsync(p => p.Id == currentGuestPlayerId, ct);
            return new LinkResult(LinkOutcome.NeedsPseudo, guest.Id, guest.AuthToken);
        }

        var player = await db.Players.FirstAsync(p => p.Id == currentGuestPlayerId, ct);
        player.IsGuest = false;
        player.Email = email;
        player.Pseudo = pseudo;
        await db.SaveChangesAsync(ct);

        return new LinkResult(LinkOutcome.Linked, player.Id, player.AuthToken);
    }
}
