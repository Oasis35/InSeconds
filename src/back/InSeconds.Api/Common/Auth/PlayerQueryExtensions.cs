using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Common.Auth;

internal enum PlayerLookupFailure { NotFound, IsGuest }

// Centralise le chargement + la vérification "compte lié" dupliqués mot pour mot dans
// UpdatePseudo/RequestEmailChange.
internal static class PlayerQueryExtensions
{
    internal static async Task<(Player? Player, PlayerLookupFailure? Failure)> LoadLinkedPlayerAsync(
        this ApplicationDbContext db, Guid playerId, CancellationToken ct)
    {
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct);

        if (player is null)
            return (null, PlayerLookupFailure.NotFound);

        if (player.IsGuest)
            return (null, PlayerLookupFailure.IsGuest);

        return (player, null);
    }
}
