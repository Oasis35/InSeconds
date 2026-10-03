using InSeconds.Api.Modules.Players.Contracts;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

/// <param name="IsGuest">Vrai tant que le joueur n'a pas de compte.</param>
public sealed record PlayerMeResponse(Guid PlayerId, bool IsGuest, string? Email, string? Pseudo, bool IsAdmin);

/// <summary>Lectures du module Players, en projections directes.</summary>
public interface IPlayerQueries
{
    /// <summary>Le joueur et son compte éventuel ; rien s'il n'existe pas ou a été supprimé.</summary>
    Task<PlayerMeResponse?> FindMeAsync(Guid playerId, CancellationToken ct);
}

public static class GetMeEndpoint
{
    /// <summary>
    /// <c>GET /api/players/me</c> : lecture seule, 204 sans identité. Ne crée jamais de joueur (R7) :
    /// le front appelle d'abord <c>POST /api/players/guest</c> quand il lui en faut un.
    /// </summary>
    [WolverineGet("/api/players/me")]
    [NoContentIfMissing]
    public static async Task<PlayerMeResponse?> Get(ICurrentPlayer current, IPlayerQueries queries, CancellationToken ct) =>
        current.PlayerId is { } playerId ? await queries.FindMeAsync(playerId, ct) : null;
}
