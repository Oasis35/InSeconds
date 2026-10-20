using InSeconds.Api.Modules.Catalogue.Contracts;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// L'usage des morceaux par le **Daily seul**. Il fournit l'<see cref="ITrackUsage"/> du Daily (ajouté au conteneur avec ceux des autres modes,
/// que Catalogue réunit) et y ajoute le cooldown, une règle du Daily : le tirage d'un défi du jour l'injecte lui-même, jamais
/// <see cref="ITrackUsage"/> (il recevrait celui du dernier mode enregistré).
/// </summary>
public interface IDailyTrackUsage : ITrackUsage
{
    /// <summary>Les morceaux qu'un défi de ce jour ne pourrait pas tirer à cause du cooldown.</summary>
    Task<IReadOnlySet<int>> GetTracksInCooldownAsync(DateOnly day, CancellationToken ct);
}
