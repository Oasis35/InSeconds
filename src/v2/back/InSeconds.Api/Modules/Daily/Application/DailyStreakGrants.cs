using InSeconds.Api.Modules.Daily.Contracts;
using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// Le gel offert à la création d'un compte (v1 : <c>Player.LinkToAccount</c>), accordé **dans la transaction** de la création (§ 5.2 du plan v2) :
/// le joueur voit son gel tout de suite, pas par un message. Le stock passe à au moins un gel, jamais au-delà de ce qu'il avait.
/// </summary>
public sealed class DailyStreakGrants(IDailyStore store) : IStreakGrants
{
    public async Task GrantAccountCreationFreezeAsync(Guid playerId, CancellationToken ct)
    {
        var streak = await store.FindStreakAsync(playerId, ct);
        if (streak is null)
        {
            streak = DailyStreak.Create(playerId);
            store.Add(streak);
        }

        streak.GrantAccountCreationFreeze();
    }
}
