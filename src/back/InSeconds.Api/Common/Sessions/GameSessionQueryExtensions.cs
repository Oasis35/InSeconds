using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Common.Sessions;

internal enum SessionLookupFailure { NotFound, WrongPlayer }

// Centralise le chargement + la vérification de propriété dupliqués mot pour mot dans
// UpdateListening/AbandonSession/SubmitAnswer. La validation de statut (Pending, ou les
// branches Completed/Abandoned/Expired propres à AbandonSession) reste dans chaque
// handler, car elle diverge légitimement selon l'action.
internal static class GameSessionQueryExtensions
{
    internal static async Task<(GameSession? Session, SessionLookupFailure? Failure)> LoadOwnedSessionAsync(
        this ApplicationDbContext db, int sessionId, Guid playerId, CancellationToken ct)
    {
        var session = await db.GameSessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct);

        if (session is null)
            return (null, SessionLookupFailure.NotFound);

        if (session.PlayerId != playerId)
            return (null, SessionLookupFailure.WrongPlayer);

        return (session, null);
    }
}
