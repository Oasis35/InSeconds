using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Domain;

namespace InSeconds.Api.Modules.Players.Persistence;

public sealed class EfPlayerStore(InSecondsDbContext db) : IPlayerStore
{
    public void Add(Player player) => db.Add(player);

    // AddAsync : la séquence de l'identifiant (HiLo) est lue au besoin, l'identifiant est connu tout de suite.
    public async ValueTask AddAsync(DeviceSession session, CancellationToken ct) => await db.AddAsync(session, ct);
}
