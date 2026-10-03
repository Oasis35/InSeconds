namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Écritures du module Players. Rien n'est enregistré ici : dans un handler Wolverine, la
/// transaction est appliquée par Wolverine (<c>AutoApplyTransactions</c>).
/// </summary>
public interface IPlayerStore
{
    void Add(Player player);

    /// <summary>Ajoute la session et lui attribue tout de suite son identifiant, qui va dans le cookie.</summary>
    ValueTask AddAsync(DeviceSession session, CancellationToken ct);
}
