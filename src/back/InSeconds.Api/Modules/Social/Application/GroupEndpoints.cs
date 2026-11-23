using System.Globalization;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Contracts;
using InSeconds.Api.Modules.Social.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Social.Application;

/// <summary>Le corps de la création d'un groupe.</summary>
public sealed record CreateGroup(string Name);

public static class ListMyGroupsEndpoint
{
    /// <summary>
    /// <c>GET /api/social/groups</c> : les groupes du joueur, avec leur code d'invitation. Un invité n'en a aucun (liste vide, jamais une erreur :
    /// l'écran propose de créer un compte).
    /// </summary>
    [Authorize]
    [WolverineGet("/api/social/groups", OperationId = "listMyGroups")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<GroupListResponse> Get(ICurrentPlayer current, ISocialQueries queries, SocialRules rules, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var groups = await queries.ListGroupsOfAsync(playerId, ct);
        return new GroupListResponse([.. groups.Select(g => SocialViews.SummaryOf(g, playerId, rules.MaxMembers))], rules.MaxGroups);
    }
}

/// <summary>Ce que la création a trouvé : le compte du joueur et dans combien de groupes il est déjà.</summary>
public sealed record GroupCreation(Guid PlayerId, bool HasAccount, int Memberships);

public static class CreateGroupEndpoint
{
    public static async Task<GroupCreation> LoadAsync(ICurrentPlayer current, IPlayerDirectory players, IGroupStore store, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        // Deux créations simultanées (double clic) ne dépassent pas la limite de groupes.
        await store.LockPlayerAsync(playerId, ct);
        return new GroupCreation(playerId, await players.HasAccountAsync(playerId, ct), await store.CountMembershipsAsync(playerId, ct));
    }

    public static ProblemDetails Validate(CreateGroup request, GroupCreation creation, SocialRules rules)
    {
        if (!creation.HasAccount)
            return SocialProblems.AccountRequired();
        if (!GroupName.IsValid(request.Name, rules.MaxNameLength))
            return SocialProblems.InvalidName(rules.MaxNameLength);
        return creation.Memberships >= rules.MaxGroups ? SocialProblems.TooManyGroups() : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>POST /api/social/groups</c> : crée un groupe dont le joueur est le créateur et le premier membre. 403 <c>social.account_required</c> pour un
    /// invité, 400 <c>social.invalid_name</c> (mêmes caractères permis qu'un pseudo), 409 <c>social.too_many_groups</c>, 429 au-delà de 20 écritures
    /// en 10 minutes.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/social/groups", OperationId = "createGroup")]
    [EnableRateLimiting(RateLimitPolicies.SocialWrite)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static async Task<GroupSummaryResponse> Post(
        CreateGroup request, [NotBody] GroupCreation creation, IGroupStore store, SocialRules rules, SocialMetrics metrics, TimeProvider time,
        ILogger<Group> logger, CancellationToken ct)
    {
        var code = await GroupCodes.NewAsync(store, ct);
        var group = Group.Create(request.Name, code, creation.PlayerId, time.GetUtcNow());
        store.Add(group);
        SocialLog.GroupCreated(logger, group.Id, creation.PlayerId);
        metrics.Group(SocialMetrics.Created);
        return SocialViews.SummaryOf(group, creation.PlayerId, rules.MaxMembers);
    }
}

internal static class GroupCodes
{
    private const int Attempts = 5;

    /// <summary>Un code d'invitation qu'aucun groupe n'a (l'index unique tranche la rarissime égalité simultanée).</summary>
    public static async Task<string> NewAsync(IGroupStore store, CancellationToken ct)
    {
        for (var attempt = 0; attempt < Attempts; attempt++)
        {
            var code = GroupInviteCode.Generate();
            if (!await store.InviteCodeExistsAsync(code, ct))
                return code;
        }

        throw new InvalidOperationException("Aucun code d'invitation libre après plusieurs tirages.");
    }
}

public static class GetGroupEndpoint
{
    public static Task<GroupView?> LoadAsync(int id, ICurrentPlayer current, ISocialQueries queries, CancellationToken ct) =>
        queries.FindGroupForMemberAsync(id, current.PlayerId!.Value, ct);

    public static ProblemDetails Validate(GroupView? group) => group is null ? SocialProblems.GroupNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/social/groups/{id}</c> : le groupe et ses membres (leurs pseudos), pour un membre seulement ; un non-membre, comme un groupe qui
    /// n'existe pas : 404 <c>social.group_not_found</c> (rien n'est révélé).
    /// </summary>
    [Authorize]
    [WolverineGet("/api/social/groups/{id}", OperationId = "getGroup")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<GroupDetailResponse> Get(
        [NotBody] GroupView group, ICurrentPlayer current, IPlayerDirectory players, SocialRules rules, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var pseudos = await players.GetPseudosAsync([.. group.Members.Select(m => m.PlayerId)], ct);
        var members = group.Members
            .OrderBy(m => m.PlayerId == group.OwnerId ? 0 : 1).ThenBy(m => m.JoinedAt).ThenBy(m => m.PlayerId)
            .Select(m => new GroupMemberResponse(pseudos.GetValueOrDefault(m.PlayerId, "?"), m.PlayerId == playerId, m.PlayerId == group.OwnerId, m.JoinedAt))
            .ToList();
        return new GroupDetailResponse(group.Id, group.Name, group.InviteCode, group.OwnerId == playerId, rules.MaxMembers, group.CreatedAt, members);
    }
}

public static class GetGroupRankingEndpoint
{
    public static Task<GroupView?> LoadAsync(int id, ICurrentPlayer current, ISocialQueries queries, CancellationToken ct) =>
        queries.FindGroupForMemberAsync(id, current.PlayerId!.Value, ct);

    public static ProblemDetails Validate(GroupView? group) => group is null ? SocialProblems.GroupNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/social/groups/{id}/ranking</c> : le classement du groupe (performance moyenne des modes joués, pseudos des membres), pour un
    /// membre seulement : un non-membre, 404 <c>social.group_not_found</c>.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/social/groups/{id}/ranking", OperationId = "getGroupRanking")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<GroupRankingResponse> Get([NotBody] GroupView group, ICurrentPlayer current, GroupRanking ranking, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var rows = await ranking.RankAsync(group, ct);
        return new GroupRankingResponse(
            group.Id, group.Name, [.. rows.Select(r => new RankingEntryResponse(r.Rank, r.Pseudo, r.PlayerId == playerId, r.Performance, r.GamesPlayed, r.BestScore, r.Points, r.Badge))]);
    }
}

public static class GetGroupScoresEndpoint
{
    public static Task<GroupView?> LoadAsync(int id, ICurrentPlayer current, ISocialQueries queries, CancellationToken ct) =>
        queries.FindGroupForMemberAsync(id, current.PlayerId!.Value, ct);

    public static ProblemDetails Validate(GroupView? group) => group is null ? SocialProblems.GroupNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/social/groups/{id}/scores</c> : le classement du groupe par score, un par mode qui en donne (le Défi du jour) : le jour (score de
    /// la partie finie, montré seulement à un joueur qui a fini la sienne) et la semaine glissante (somme des scores des sept derniers jours, un jour
    /// manqué vaut 0). Pour un membre seulement : un non-membre, 404 <c>social.group_not_found</c>.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/social/groups/{id}/scores", OperationId = "getGroupScores")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<GroupScoresResponse> Get([NotBody] GroupView group, ICurrentPlayer current, GroupScores scores, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var modes = await scores.RankAsync(group, playerId, ct);
        return new GroupScoresResponse(group.Id, group.Name, [.. modes.Select(m => new ModeScoresResponse(
            m.Mode, m.Day, m.TodayRevealed, ScorePeriods.WeekDays,
            [.. m.Today.Select(t => new TodayScoreEntryResponse(t.Row.Rank, t.Row.Pseudo, t.Row.PlayerId == playerId, t.Played, t.Row.Score))],
            [.. m.Week.Select(w => new WeekScoreEntryResponse(w.Row.Rank, w.Row.Pseudo, w.Row.PlayerId == playerId, w.Row.Score, w.PlayedDays))]))]);
    }
}

public static class GetGroupDayScoresEndpoint
{
    public static Task<GroupView?> LoadAsync(int id, ICurrentPlayer current, ISocialQueries queries, CancellationToken ct) =>
        queries.FindGroupForMemberAsync(id, current.PlayerId!.Value, ct);

    public static ProblemDetails Validate(GroupView? group, string date, IGameCalendar calendar)
    {
        if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) || day > calendar.Today)
            return SocialProblems.InvalidDate();
        return group is null ? SocialProblems.GroupNotFound() : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>GET /api/social/groups/{id}/scores/{date}</c> : le classement du groupe sur le défi d'un jour (la page d'un jour de l'historique), un par mode
    /// qui en donne : le score de chaque membre qui a fini sa partie ce jour-là, montré seulement si le joueur ne peut plus jouer ce défi (piège 18 :
    /// la veille reste cachée tant que sa partie de la veille est en cours). Pour un membre seulement : un non-membre, 404 <c>social.group_not_found</c> ;
    /// un jour mal écrit ou futur, 400 <c>social.invalid_date</c>.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/social/groups/{id}/scores/{date}", OperationId = "getGroupDayScores")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<GroupDayScoresResponse> Get([NotBody] GroupView group, string date, ICurrentPlayer current, GroupScores scores, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var day = DateOnly.ParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var modes = await scores.RankDayAsync(group, playerId, day, ct);
        return new GroupDayScoresResponse(group.Id, group.Name, [.. modes.Select(m => new ModeDayScoresResponse(
            m.Mode, m.Day, m.Revealed, [.. m.Lines.Select(l => new TodayScoreEntryResponse(l.Row.Rank, l.Row.Pseudo, l.Row.PlayerId == playerId, l.Played, l.Row.Score))]))]);
    }
}

public static class GetInvitationEndpoint
{
    public static Task<InvitationView?> LoadAsync(string code, ICurrentPlayer current, ISocialQueries queries, CancellationToken ct) =>
        GroupInviteCode.Normalize(code) is { } normalized ? queries.FindInvitationAsync(normalized, current.PlayerId, ct) : Task.FromResult<InvitationView?>(null);

    public static ProblemDetails Validate(InvitationView? invitation) =>
        invitation is null ? SocialProblems.InvitationNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/social/invitations/{code}</c> : ce que montre le lien d'invitation (le nom du groupe et sa place, jamais ses membres). Anonyme
    /// permis (un ami sans identité ouvre le lien, comme celui d'une playlist), lecture seule ; le code se saisit sans tenir compte de la casse. 404
    /// <c>social.invitation_not_found</c>, 429 au-delà de 60 lectures en 5 minutes par IP.
    /// </summary>
    [WolverineGet("/api/social/invitations/{code}", OperationId = "getInvitation")]
    [EnableRateLimiting(RateLimitPolicies.SocialInvitation)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static InvitationResponse Get([NotBody] InvitationView invitation, SocialRules rules) =>
        new(invitation.Name, invitation.MemberCount, rules.MaxMembers, invitation.MemberCount >= rules.MaxMembers, invitation.AlreadyMember);
}

/// <summary>Ce que l'adhésion par lien a trouvé : le compte du joueur, le groupe, et dans combien de groupes il est déjà.</summary>
public sealed record GroupJoin(Guid PlayerId, bool HasAccount, Group? Group, int Memberships);

public static class JoinGroupEndpoint
{
    public static async Task<GroupJoin> LoadAsync(
        string code, ICurrentPlayer current, IPlayerDirectory players, IGroupStore store, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var normalized = GroupInviteCode.Normalize(code);
        if (normalized is null || await store.FindIdByInviteCodeAsync(normalized, ct) is not { } groupId)
            return new GroupJoin(playerId, false, null, 0);

        // Le joueur d'abord, le groupe ensuite (toujours dans cet ordre) ; le groupe n'est chargé qu'une fois le verrou pris, pour compter ses membres
        // à jour : deux adhésions simultanées ne dépassent ni sa place ni la limite de groupes du joueur.
        await store.LockPlayerAsync(playerId, ct);
        await store.LockGroupAsync(groupId, ct);
        var group = await store.FindAsync(groupId, ct);
        return new GroupJoin(playerId, await players.HasAccountAsync(playerId, ct), group, await store.CountMembershipsAsync(playerId, ct));
    }

    public static ProblemDetails Validate(GroupJoin join, SocialRules rules)
    {
        if (join.Group is null)
            return SocialProblems.InvitationNotFound();
        if (!join.HasAccount)
            return SocialProblems.AccountRequired();
        // Déjà membre : rien à refuser, l'adhésion est idempotente (un lien ouvert deux fois).
        if (join.Group.IsMember(join.PlayerId))
            return WolverineContinue.NoProblems;
        if (join.Group.IsFull(rules.MaxMembers))
            return SocialProblems.GroupFull();
        return join.Memberships >= rules.MaxGroups ? SocialProblems.TooManyGroups() : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>POST /api/social/invitations/{code}/join</c> : rejoint le groupe du lien. Idempotent (déjà membre : rien ne change). 404
    /// <c>social.invitation_not_found</c>, 403 <c>social.account_required</c> pour un invité (le front l'invite à créer un compte puis à rouvrir le
    /// lien), 409 <c>social.group_full</c> ou <c>social.too_many_groups</c>, 429 au-delà de 20 écritures en 10 minutes.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/social/invitations/{code}/join", OperationId = "joinGroup")]
    [EnableRateLimiting(RateLimitPolicies.SocialWrite)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static GroupSummaryResponse Post([NotBody] GroupJoin join, [NotBody] SocialRules rules, [NotBody] SocialMetrics metrics, TimeProvider time, ILogger<Group> logger)
    {
        var group = join.Group!;
        if (!group.IsMember(join.PlayerId))
        {
            group.Join(join.PlayerId, time.GetUtcNow());
            SocialLog.GroupJoined(logger, group.Id, join.PlayerId);
            metrics.Group(SocialMetrics.Joined);
        }

        return SocialViews.SummaryOf(group, join.PlayerId, rules.MaxMembers);
    }
}

/// <summary>Le groupe chargé pour une action, et le joueur qui l'a demandée.</summary>
public sealed record GroupAction(Guid PlayerId, Group? Group);

internal static class GroupActionSteps
{
    public static async Task<GroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct)
    {
        // Verrou avant la lecture : le groupe se charge à jour, et une adhésion simultanée attend cette action.
        await store.LockGroupAsync(id, ct);
        return new GroupAction(current.PlayerId!.Value, await store.FindAsync(id, ct));
    }

    /// <summary>Un non-membre ne distingue pas un groupe inconnu d'un groupe qui n'est pas le sien.</summary>
    public static ProblemDetails ValidateMember(GroupAction action) =>
        action.Group is { } group && group.IsMember(action.PlayerId) ? WolverineContinue.NoProblems : SocialProblems.GroupNotFound();

    public static ProblemDetails ValidateOwner(GroupAction action)
    {
        var member = ValidateMember(action);
        if (!ReferenceEquals(member, WolverineContinue.NoProblems))
            return member;
        return action.Group!.IsOwner(action.PlayerId) ? WolverineContinue.NoProblems : SocialProblems.NotOwner();
    }
}

/// <summary>Le groupe chargé pour un départ, et le membre que le créateur désigne pour lui succéder (vide s'il n'en désigne aucun ou s'il n'est pas dans le groupe).</summary>
public sealed record GroupLeave(GroupAction Action, Guid? SuccessorId);

public static class LeaveGroupEndpoint
{
    public static async Task<GroupLeave> LoadAsync(
        int id, string? successor, ICurrentPlayer current, IGroupStore store, IPlayerDirectory players, CancellationToken ct)
    {
        var action = await GroupActionSteps.LoadAsync(id, current, store, ct);
        return new GroupLeave(action, await GroupHandOver.FindMemberAsync(action.Group, successor, players, ct));
    }

    public static ProblemDetails Validate(GroupLeave leave, string? successor)
    {
        var member = GroupActionSteps.ValidateMember(leave.Action);
        if (!ReferenceEquals(member, WolverineContinue.NoProblems))
            return member;
        return GroupHandOver.Check(leave.Action.Group!, leave.Action.PlayerId, successor, leave.SuccessorId);
    }

    /// <summary>
    /// <c>DELETE /api/social/groups/{id}/membership?successor=pseudo</c> : quitte le groupe (204) ; le dernier qui part supprime le groupe. Le créateur
    /// ne part pas tant qu'il reste d'autres membres : il désigne en même temps son successeur (<c>successor</c>, le pseudo d'un autre membre), et le
    /// changement de créateur et le départ se font ensemble ou pas du tout. 404 <c>social.group_not_found</c> pour un non-membre, 409
    /// <c>social.owner_must_hand_over</c> pour un créateur qui n'en désigne aucun, 400 <c>social.invalid_successor</c> si ce pseudo n'est pas celui
    /// d'un autre membre.
    /// </summary>
    [Authorize]
    [WolverineDelete("/api/social/groups/{id}/membership", OperationId = "leaveGroup")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static void Delete([NotBody] GroupLeave leave, IGroupStore store, [NotBody] SocialMetrics metrics, ILogger<Group> logger)
    {
        var (action, successorId) = (leave.Action, leave.SuccessorId);
        var group = action.Group!;
        if (group.MustHandOverBeforeLeaving(action.PlayerId))
            SocialLog.OwnerTransferred(logger, group.Id, successorId!.Value, action.PlayerId);
        var departure = group.Leave(action.PlayerId, successorId);
        if (departure == GroupDeparture.Emptied)
            store.Remove(group);
        SocialLog.GroupLeft(logger, group.Id, action.PlayerId, departure.ToString());
        metrics.Group(departure == GroupDeparture.Emptied ? SocialMetrics.Emptied : SocialMetrics.Left);
    }
}

public static class RenameGroupEndpoint
{
    public static Task<GroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        GroupActionSteps.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(RenameGroup request, GroupAction action, SocialRules rules)
    {
        var owner = GroupActionSteps.ValidateOwner(action);
        if (!ReferenceEquals(owner, WolverineContinue.NoProblems))
            return owner;
        return GroupName.IsValid(request.Name, rules.MaxNameLength) ? WolverineContinue.NoProblems : SocialProblems.InvalidName(rules.MaxNameLength);
    }

    /// <summary>
    /// <c>PUT /api/social/groups/{id}/name</c> : le créateur renomme son groupe (mêmes caractères permis et même longueur qu'à la création) et rend le
    /// nom enregistré. 400 <c>social.invalid_name</c>, 404 <c>social.group_not_found</c> pour un non-membre, 403 <c>social.not_owner</c> pour un simple
    /// membre.
    /// </summary>
    [Authorize]
    [WolverinePut("/api/social/groups/{id}/name", OperationId = "renameGroup")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static GroupNameResponse Put(RenameGroup request, [NotBody] GroupAction action, ILogger<Group> logger)
    {
        var group = action.Group!;
        group.Rename(request.Name);
        SocialLog.GroupRenamed(logger, group.Id, action.PlayerId);
        return new GroupNameResponse(group.Name);
    }
}

/// <summary>Le corps du changement de créateur : le pseudo d'un autre membre (un membre ne voit jamais l'identifiant d'un autre).</summary>
public sealed record TransferGroupOwner(string Pseudo);

public static class TransferGroupOwnerEndpoint
{
    public static Task<GroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        GroupActionSteps.LoadAsync(id, current, store, ct);

    public static async Task<ProblemDetails> ValidateAsync(TransferGroupOwner request, GroupAction action, IPlayerDirectory players, CancellationToken ct)
    {
        var owner = GroupActionSteps.ValidateOwner(action);
        if (!ReferenceEquals(owner, WolverineContinue.NoProblems))
            return owner;
        var memberId = await GroupHandOver.FindMemberAsync(action.Group, request.Pseudo, players, ct);
        return memberId is { } id && action.Group!.CanTransferTo(id) ? WolverineContinue.NoProblems : SocialProblems.InvalidSuccessor();
    }

    /// <summary>
    /// <c>PUT /api/social/groups/{id}/owner</c> : le créateur confie le groupe à un autre membre, désigné par son pseudo (204), sans partir. Il devient
    /// un simple membre et ne retrouve le statut que si le nouveau créateur le désigne à son tour. 400 <c>social.invalid_successor</c> si ce pseudo
    /// n'est pas celui d'un autre membre, 404 <c>social.group_not_found</c> pour un non-membre, 403 <c>social.not_owner</c> pour un simple membre.
    /// </summary>
    [Authorize]
    [WolverinePut("/api/social/groups/{id}/owner", OperationId = "transferGroupOwner")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task Put(TransferGroupOwner request, [NotBody] GroupAction action, IPlayerDirectory players, ILogger<Group> logger, CancellationToken ct)
    {
        var group = action.Group!;
        var newOwnerId = (await GroupHandOver.FindMemberAsync(group, request.Pseudo, players, ct))!.Value;
        group.TransferOwnership(newOwnerId);
        SocialLog.OwnerTransferred(logger, group.Id, newOwnerId, action.PlayerId);
    }
}

public static class DeleteGroupEndpoint
{
    public static Task<GroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        GroupActionSteps.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(GroupAction action) => GroupActionSteps.ValidateOwner(action);

    /// <summary>
    /// <c>DELETE /api/social/groups/{id}</c> : supprime le groupe et ses adhésions (204), pour son créateur seulement. 404
    /// <c>social.group_not_found</c> pour un non-membre, 403 <c>social.not_owner</c> pour un simple membre.
    /// </summary>
    [Authorize]
    [WolverineDelete("/api/social/groups/{id}", OperationId = "deleteGroup")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static void Delete([NotBody] GroupAction action, IGroupStore store, [NotBody] SocialMetrics metrics, ILogger<Group> logger)
    {
        store.Remove(action.Group!);
        SocialLog.GroupDeleted(logger, action.Group!.Id, action.PlayerId);
        metrics.Group(SocialMetrics.Deleted);
    }
}

public static class RotateInviteCodeEndpoint
{
    public static Task<GroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        GroupActionSteps.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(GroupAction action) => GroupActionSteps.ValidateOwner(action);

    /// <summary>
    /// <c>POST /api/social/groups/{id}/invite-code</c> : renouvelle le code d'invitation, pour son créateur seulement ; l'ancien lien ne rejoint plus
    /// rien (un lien qui a trop circulé). 404 <c>social.group_not_found</c> pour un non-membre, 403 <c>social.not_owner</c> pour un simple membre.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/social/groups/{id}/invite-code", OperationId = "rotateGroupInviteCode")]
    [EnableRateLimiting(RateLimitPolicies.SocialWrite)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static async Task<InviteCodeResponse> Post([NotBody] GroupAction action, IGroupStore store, ILogger<Group> logger, CancellationToken ct)
    {
        var group = action.Group!;
        group.RotateInviteCode(await GroupCodes.NewAsync(store, ct));
        SocialLog.InviteCodeRotated(logger, group.Id, action.PlayerId);
        return new InviteCodeResponse(group.InviteCode);
    }
}
