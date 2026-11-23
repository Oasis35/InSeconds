using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Contracts;
using InSeconds.Api.Modules.Social.Domain;

namespace InSeconds.Api.Modules.Social.Application;

public sealed record GroupMemberEntry(Guid PlayerId, DateTimeOffset JoinedAt);

/// <summary>Un groupe tel que ses membres le lisent. Jamais construit pour un non-membre : le port ne rend rien dans ce cas.</summary>
public sealed record GroupView(int Id, string Name, string InviteCode, Guid OwnerId, DateTimeOffset CreatedAt, IReadOnlyList<GroupMemberEntry> Members);

/// <summary>Un groupe tel que l'admin le lit pour le modérer : jamais le code d'invitation (les membres se lisent à part, un groupe à la fois).</summary>
public sealed record AdminGroupView(int Id, string Name, int MemberCount, Guid OwnerId, DateTimeOffset CreatedAt);

/// <summary>Les membres d'un groupe tels que l'admin les lit : le créateur, puis les adhésions, la plus ancienne d'abord.</summary>
public sealed record AdminGroupMembersView(Guid OwnerId, IReadOnlyList<GroupMemberEntry> Members);

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

    /// <summary>Les membres du groupe pour l'admin qui l'ouvre afin de le modérer ; rien rendu si le groupe n'existe pas.</summary>
    Task<AdminGroupMembersView?> FindGroupMembersAsync(int groupId, CancellationToken ct);

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
            // La semaine est à la charge de la source (contrat) : ses points et ses jours joués sont repris tels quels.
            var week = ScoreRankingPolicy.Rank(ids.Select(id => new ScoreInput(id, PseudoOf(id), Of(id) is { WeekPlayedDays.Count: > 0 } m ? m.WeekPoints : null)));
            modes.Add(new ModeScoresView(
                source.Source, scores.Day, scores.TodayRevealed,
                [.. today.Select(r => new TodayScoreLine(r, Of(r.PlayerId)?.PlayedToday ?? false))],
                [.. week.Select(r => new WeekScoreLine(r, Of(r.PlayerId)?.WeekPlayedDays ?? []))]));
        }

        return modes;
    }

    /// <summary>
    /// Le classement du groupe sur le défi d'un jour, un par mode : le score de chaque membre qui a fini sa partie ce jour-là, rendu seulement si le
    /// mode le permet au joueur qui regarde (sinon, ni rang ni score : la ligne dit seulement qui l'a fini, et même cela reste caché).
    /// </summary>
    public async Task<IReadOnlyList<ModeDayScoresView>> RankDayAsync(GroupView group, Guid viewerId, DateOnly day, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(group);
        IReadOnlyList<Guid> ids = [.. group.Members.Select(m => m.PlayerId)];
        var pseudos = await players.GetPseudosAsync(ids, ct);
        var modes = new List<ModeDayScoresView>();
        foreach (var source in sources.OrderBy(s => s.Source, StringComparer.Ordinal))
        {
            var scores = await source.GetDayAsync(viewerId, day, ids, ct);
            // Rien n'est montré tant que le mode ne le permet pas, même si la source rendait des scores.
            int? ScoreOf(Guid id) => scores.Revealed && scores.Scores.TryGetValue(id, out var score) ? score : null;
            var rows = ScoreRankingPolicy.Rank(ids.Select(id => new ScoreInput(id, pseudos.GetValueOrDefault(id, "?"), ScoreOf(id))));
            modes.Add(new ModeDayScoresView(source.Source, day, scores.Revealed, [.. rows.Select(r => new TodayScoreLine(r, r.Score is not null))]));
        }

        return modes;
    }
}

/// <summary>Le classement d'un mode pour un groupe sur le défi d'un jour, ses lignes encore avec l'identifiant des membres.</summary>
public sealed record ModeDayScoresView(string Mode, DateOnly Day, bool Revealed, IReadOnlyList<TodayScoreLine> Lines);
