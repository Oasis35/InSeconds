using InSeconds.Api.Modules.Players.Contracts;
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
        CreateGroup request, [NotBody] GroupCreation creation, IGroupStore store, SocialRules rules, TimeProvider time, ILogger<Group> logger,
        CancellationToken ct)
    {
        var code = await GroupCodes.NewAsync(store, ct);
        var group = Group.Create(request.Name, code, creation.PlayerId, time.GetUtcNow());
        store.Add(group);
        SocialLog.GroupCreated(logger, group.Id, creation.PlayerId);
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
    public static GroupSummaryResponse Post([NotBody] GroupJoin join, SocialRules rules, TimeProvider time, ILogger<Group> logger)
    {
        var group = join.Group!;
        if (!group.IsMember(join.PlayerId))
        {
            group.Join(join.PlayerId, time.GetUtcNow());
            SocialLog.GroupJoined(logger, group.Id, join.PlayerId);
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

public static class LeaveGroupEndpoint
{
    public static Task<GroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        GroupActionSteps.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(GroupAction action) => GroupActionSteps.ValidateMember(action);

    /// <summary>
    /// <c>DELETE /api/social/groups/{id}/membership</c> : quitte le groupe (204). Le créateur qui part passe la main au plus ancien des autres
    /// membres ; le dernier qui part supprime le groupe. 404 <c>social.group_not_found</c> pour un non-membre.
    /// </summary>
    [Authorize]
    [WolverineDelete("/api/social/groups/{id}/membership", OperationId = "leaveGroup")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static void Delete([NotBody] GroupAction action, IGroupStore store, ILogger<Group> logger)
    {
        var group = action.Group!;
        var departure = group.Leave(action.PlayerId);
        if (departure == GroupDeparture.Emptied)
            store.Remove(group);
        SocialLog.GroupLeft(logger, group.Id, action.PlayerId, departure.ToString());
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
    public static void Delete([NotBody] GroupAction action, IGroupStore store, ILogger<Group> logger)
    {
        store.Remove(action.Group!);
        SocialLog.GroupDeleted(logger, action.Group!.Id, action.PlayerId);
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
