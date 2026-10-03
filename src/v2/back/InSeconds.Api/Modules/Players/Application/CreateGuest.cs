using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

public sealed record GuestResponse(Guid PlayerId);

public static class CreateGuestEndpoint
{
    /// <summary>
    /// <c>POST /api/players/guest</c> : une identité d'invité pour ce navigateur (§ 5.5 du plan v2),
    /// par une commande explicite, jamais par un GET. Un navigateur déjà identifié garde son joueur.
    /// Limité par IP, comme toute création de joueur (S11).
    /// </summary>
    [WolverinePost("/api/players/guest")]
    [EnableRateLimiting(RateLimitPolicies.PlayerCreation)]
    public static async Task<GuestResponse> Post(
        HttpContext context, ICurrentPlayer current, IPlayerStore store, IPlayerSignIn signIn, TimeProvider time, CancellationToken ct)
    {
        if (current.PlayerId is { } existing)
            return new GuestResponse(existing);

        var now = time.GetUtcNow();
        var player = Player.CreateGuest(Guid.NewGuid(), now);
        var session = DeviceSession.Open(player.Id, now, DeviceLabel.From(context.Request.Headers.UserAgent));
        store.Add(player);
        await store.AddAsync(session, ct);
        // Le cookie part avec la réponse, après l'enregistrement de la transaction par Wolverine : si
        // l'enregistrement échoue, la réponse est une 500 sans cookie.
        await signIn.SignInAsync(player.Id, session.Id, isAdmin: false);
        return new GuestResponse(player.Id);
    }
}
