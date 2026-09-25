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
            existing.RecordSeen(DateTime.UtcNow);
            await db.SaveChangesAsync(ct);
            return new LinkResult(LinkOutcome.Found, existing.Id, existing.AuthToken);
        }

        if (string.IsNullOrWhiteSpace(pseudo))
        {
            var guest = await db.Players.FirstAsync(p => p.Id == currentGuestPlayerId, ct);
            return new LinkResult(LinkOutcome.NeedsPseudo, guest.Id, guest.AuthToken);
        }

        var player = await db.Players.FirstAsync(p => p.Id == currentGuestPlayerId, ct);

        // Le navigateur est déjà connecté à un autre compte : on ne le touche pas (sinon son
        // email et son pseudo seraient remplacés par ceux du lien), on crée un compte neuf
        // pour cette adresse et c'est lui qui recevra le cookie.
        if (!player.IsGuest)
        {
            player = Player.CreateGuest(Guid.NewGuid(), Guid.NewGuid(), DateTime.UtcNow);
            db.Players.Add(player);
        }

        player.LinkToAccount(email, pseudo);
        await db.SaveChangesAsync(ct);

        return new LinkResult(LinkOutcome.Linked, player.Id, player.AuthToken);
    }
}
