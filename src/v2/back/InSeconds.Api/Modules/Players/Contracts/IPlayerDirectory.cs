namespace InSeconds.Api.Modules.Players.Contracts;

/// <summary>Ce que les autres modules ont besoin de savoir d'un joueur (§ 5.3 du plan v2).</summary>
public interface IPlayerDirectory
{
    /// <summary>
    /// Le joueur a un compte (adresse et pseudo) : il n'est plus un invité. Les gels de série ne sont accordés qu'à un compte ;
    /// un joueur inconnu ou supprimé n'en a pas.
    /// </summary>
    Task<bool> HasAccountAsync(Guid playerId, CancellationToken ct);
}
