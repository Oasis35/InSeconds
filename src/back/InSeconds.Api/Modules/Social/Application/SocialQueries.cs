using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Contracts;
using InSeconds.Api.Modules.Social.Domain;

namespace InSeconds.Api.Modules.Social.Application;

public sealed record GroupMemberEntry(Guid PlayerId, DateTimeOffset JoinedAt);

/// <summary>Un groupe tel que ses membres le lisent. Jamais construit pour un non-membre : le port ne rend rien dans ce cas.</summary>
public sealed record GroupView(int Id, string Name, string InviteCode, Guid OwnerId, DateTimeOffset CreatedAt, IReadOnlyList<GroupMemberEntry> Members);

/// <summary>Un groupe tel que l'admin le lit pour le modérer : jamais le code d'invitation ni la liste des membres.</summary>
public sealed record AdminGroupView(int Id, string Name, int MemberCount, Guid OwnerId, DateTimeOffset CreatedAt);

/// <summary>Ce que montre un lien d'invitation, à qui le détient.</summary>
public sealed record InvitationView(string Name, int MemberCount, bool AlreadyMember);

/// <summary>Les lectures du module, en projections directes sans rien suivre.</summary>
public interface ISocialQueries
{
    /// <summary>Les groupes de ce joueur (le plus ancien d'abord), chacun avec ses membres.</summary>
    Task<IReadOnlyList<GroupView>> ListGroupsOfAsync(Guid playerId, CancellationToken ct);

    /// <summary>Le groupe, **seulement** si ce joueur en est membre : un non-membre n'apprend rien (rien rendu).</summary>
    Task<GroupView?> FindGroupForMemberAsync(int groupId, Guid playerId, CancellationToken ct);

    /// <summary>Tous les groupes, le plus récent d'abord : l'onglet Groupes de l'admin (modération).</summary>
    Task<IReadOnlyList<AdminGroupView>> ListAllGroupsAsync(CancellationToken ct);

    /// <summary>Ce que le lien montre : rien si le code est inconnu. <paramref name="playerId"/> vide : navigateur sans identité.</summary>
    Task<InvitationView?> FindInvitationAsync(string code, Guid? playerId, CancellationToken ct);
}

/// <summary>
/// Le classement d'un groupe : la performance de chaque membre vient des modes de jeu (<see cref="IMemberPerformanceSource"/>, chacun ajoute la sienne),
/// les pseudos de Players (<see cref="IPlayerDirectory"/>) ; la règle de classement est celle du domaine (<see cref="GroupRankingPolicy"/>).
/// </summary>
public sealed class GroupRanking(IEnumerable<IMemberPerformanceSource> sources, IPlayerDirectory players)
{
    public async Task<IReadOnlyList<RankingRow>> RankAsync(GroupView group, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(group);
        var ids = group.Members.Select(m => m.PlayerId).ToList();
        var pseudos = await players.GetPseudosAsync(ids, ct);
        var performances = ids.ToDictionary(id => id, _ => new List<MemberPerformance>());
        foreach (var source in sources)
        {
            foreach (var (playerId, performance) in await source.GetAsync(ids, ct))
            {
                // Une source qui rend un joueur qui n'est pas du groupe est ignorée : seuls les membres comptent.
                if (performances.TryGetValue(playerId, out var list))
                    list.Add(performance);
            }
        }

        return GroupRankingPolicy.Rank(ids.Select(id => new RankingInput(id, pseudos.GetValueOrDefault(id, "?"), performances[id])));
    }
}
