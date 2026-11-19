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

    /// <summary>Les alias de ces joueurs au classement général (ceux qui n'en ont pas n'y sont pas).</summary>
    Task<IReadOnlyDictionary<Guid, string>> GetAliasesAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct);
}

/// <summary>
/// Le classement d'un groupe : la performance de chaque membre vient des modes de jeu (<see cref="IMemberPerformanceSource"/>, chacun ajoute la sienne),
/// les pseudos de Players (<see cref="IPlayerDirectory"/>) ; la règle de classement est celle du domaine (<see cref="GroupRankingPolicy"/>).
/// </summary>
public sealed class GroupRanking(IEnumerable<IMemberPerformanceSource> sources, IPlayerDirectory players)
{
    public Task<IReadOnlyList<RankingRow>> RankAsync(GroupView group, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(group);
        return RankAsync([.. group.Members.Select(m => m.PlayerId)], ct);
    }

    /// <summary>
    /// Les joueurs du classement général : ceux que les modes y mettent (l'accès et une partie finie), **comptes seulement** (un invité n'a pas de
    /// pseudo de compte et n'y figure jamais) et **jamais un admin**, même s'il a l'accès (décision du 18/11).
    /// </summary>
    public async Task<IReadOnlyList<Guid>> ListGeneralRankingPlayersAsync(CancellationToken ct)
    {
        var ids = new HashSet<Guid>();
        foreach (var source in sources)
            ids.UnionWith(await source.ListGeneralRankingPlayersAsync(ct));
        ids.ExceptWith(await players.ListAdminsAsync(ct));
        var accounts = await players.GetPseudosAsync(ids, ct);
        return [.. ids.Where(accounts.ContainsKey)];
    }

    /// <summary>Ces joueurs, classés entre eux (le classement général).</summary>
    public async Task<IReadOnlyList<RankingRow>> RankAsync(IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(ids);
        if (ids.Count == 0)
            return [];
        var pseudos = await players.GetPseudosAsync(ids, ct);
        var performances = ids.ToDictionary(id => id, _ => new List<MemberPerformance>());
        foreach (var source in sources)
        {
            foreach (var (playerId, performance) in await source.GetAsync(ids, ct))
            {
                // Une source qui rend un joueur qu'on ne lui a pas demandé est ignorée.
                if (performances.TryGetValue(playerId, out var list))
                    list.Add(performance);
            }
        }

        return GroupRankingPolicy.Rank(ids.Select(id => new RankingInput(id, pseudos.GetValueOrDefault(id, "?"), performances[id])));
    }
}

/// <summary>Le classement d'un mode pour un groupe, ses lignes encore avec l'identifiant des membres.</summary>
public sealed record ModeScoresView(string Mode, DateOnly Day, bool TodayRevealed, IReadOnlyList<TodayScoreLine> Today, IReadOnlyList<WeekScoreLine> Week);

public sealed record TodayScoreLine(ScoreRow Row, bool Played);

/// <param name="PlayedDays">Les jours de la semaine où il a fini une partie, du plus ancien au plus récent.</param>
public sealed record WeekScoreLine(ScoreRow Row, IReadOnlyList<DateOnly> PlayedDays);

/// <summary>
/// Le classement par score d'un groupe : les scores viennent des modes (<see cref="IMemberScoreSource"/>, chacun ajoute le sien), les pseudos de
/// Players ; un classement par mode, jamais une moyenne des modes. La règle de classement est celle du domaine (<see cref="ScoreRankingPolicy"/>).
/// </summary>
public sealed class GroupScores(IEnumerable<IMemberScoreSource> sources, IPlayerDirectory players)
{
    public async Task<IReadOnlyList<ModeScoresView>> RankAsync(GroupView group, Guid viewerId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(group);
        IReadOnlyList<Guid> ids = [.. group.Members.Select(m => m.PlayerId)];
        var pseudos = await players.GetPseudosAsync(ids, ct);
        var modes = new List<ModeScoresView>();
        foreach (var source in sources.OrderBy(s => s.Source, StringComparer.Ordinal))
        {
            var scores = await source.GetAsync(viewerId, ids, ct);
            // Une source qui rend un joueur qu'on ne lui a pas demandé est ignorée (il n'est pas dans la liste des membres).
            MemberPeriodScores? Of(Guid id) => scores.Members.GetValueOrDefault(id);
            string PseudoOf(Guid id) => pseudos.GetValueOrDefault(id, "?");

            // Le score du jour n'est jamais rendu avant que le joueur qui regarde ait fini sa partie, même si la source l'oubliait.
            var today = ScoreRankingPolicy.Rank(ids.Select(id => new ScoreInput(id, PseudoOf(id), scores.TodayRevealed && Of(id) is { PlayedToday: true } m ? m.TodayScore : null)));
            // Les jours joués que rend la source, ramenés à la semaine qui finit son jour et sans doublon : jamais plus de sept à l'écran.
            var weekStart = scores.Day.AddDays(-(ScorePeriods.WeekDays - 1));
            IReadOnlyList<DateOnly> PlayedDays(Guid id) =>
                Of(id)?.WeekPlayedDays is { } days ? [.. days.Where(d => d >= weekStart && d <= scores.Day).Distinct().Order()] : [];
            var week = ScoreRankingPolicy.Rank(ids.Select(id => new ScoreInput(id, PseudoOf(id), PlayedDays(id).Count > 0 ? Of(id)!.WeekPoints : null)));
            modes.Add(new ModeScoresView(
                source.Source, scores.Day, scores.TodayRevealed,
                [.. today.Select(r => new TodayScoreLine(r, Of(r.PlayerId)?.PlayedToday ?? false))],
                [.. week.Select(r => new WeekScoreLine(r, PlayedDays(r.PlayerId)))]));
        }

        return modes;
    }
}
