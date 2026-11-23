using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Social.Application;

// Modération des groupes, dans l'onglet Groupes de l'admin. Toute route /api/admin* reçoit la policy Admin automatiquement (401 sans joueur, 403 sans le
// rôle). L'admin voit le nom, le nombre de membres, le créateur (son pseudo) et la date : jamais le code d'invitation (un secret qui donne l'accès), ni
// la liste des membres, qui ne se lit qu'à la demande, un groupe à la fois.

/// <param name="OwnerPseudo">Le pseudo du créateur (toujours un compte) ; vide s'il est introuvable.</param>
public sealed record AdminGroupResponse(int Id, string Name, int MemberCount, Guid OwnerId, string? OwnerPseudo, DateTimeOffset CreatedAt);

public sealed record AdminGroupsResponse(IReadOnlyList<AdminGroupResponse> Groups);

/// <param name="Pseudo">Le pseudo du compte (un groupe n'a que des comptes) ; vide s'il est introuvable.</param>
public sealed record AdminGroupMemberResponse(string? Pseudo, bool IsOwner, DateTimeOffset JoinedAt);

public sealed record AdminGroupMembersResponse(IReadOnlyList<AdminGroupMemberResponse> Members);

/// <summary>Le corps du renommage d'un groupe par l'admin.</summary>
public sealed record RenameGroup(string Name);

/// <summary>Le nom que le groupe porte maintenant.</summary>
public sealed record GroupNameResponse(string Name);

public static class ListAdminGroupsEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/social/groups</c> : tous les groupes, le plus récent d'abord, chacun avec son nombre de membres et le pseudo de son
    /// créateur. Le filtre texte est fait par l'écran.
    /// </summary>
    [WolverineGet("/api/admin/social/groups", OperationId = "listAdminGroups")]
    public static async Task<AdminGroupsResponse> Get(ISocialQueries queries, IPlayerDirectory players, CancellationToken ct)
    {
        var groups = await queries.ListAllGroupsAsync(ct);
        var pseudos = await players.GetPseudosAsync([.. groups.Select(g => g.OwnerId).Distinct()], ct);
        return new AdminGroupsResponse([.. groups.Select(g => new AdminGroupResponse(g.Id, g.Name, g.MemberCount, g.OwnerId, pseudos.GetValueOrDefault(g.OwnerId), g.CreatedAt))]);
    }
}

public static class ListAdminGroupMembersEndpoint
{
    public static Task<AdminGroupMembersView?> LoadAsync(int id, ISocialQueries queries, CancellationToken ct) => queries.FindGroupMembersAsync(id, ct);

    public static ProblemDetails Validate(AdminGroupMembersView? group) => group is null ? SocialProblems.GroupNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/admin/social/groups/{id}/members</c> : les membres du groupe (pseudo, créateur ou non, date d'adhésion), le plus ancien d'abord.
    /// Lus à la demande quand l'admin ouvre un groupe, jamais avec la liste. 404 <c>social.group_not_found</c>.
    /// </summary>
    [WolverineGet("/api/admin/social/groups/{id}/members", OperationId = "listAdminGroupMembers")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<AdminGroupMembersResponse> Get([NotBody] AdminGroupMembersView group, IPlayerDirectory players, CancellationToken ct)
    {
        var pseudos = await players.GetPseudosAsync([.. group.Members.Select(m => m.PlayerId)], ct);
        return new AdminGroupMembersResponse([.. group.Members.Select(m => new AdminGroupMemberResponse(pseudos.GetValueOrDefault(m.PlayerId), m.PlayerId == group.OwnerId, m.JoinedAt))]);
    }
}

/// <summary>Le groupe visé par une action de l'admin, et l'admin qui l'a demandée.</summary>
public sealed record AdminGroupAction(Guid AdminId, Group? Group);

internal static class AdminGroupSteps
{
    public static async Task<AdminGroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct)
    {
        // Verrou avant la lecture, comme les actions des membres : une adhésion simultanée attend cette action.
        await store.LockGroupAsync(id, ct);
        return new AdminGroupAction(current.PlayerId!.Value, await store.FindAsync(id, ct));
    }

    public static ProblemDetails Validate(AdminGroupAction action) => action.Group is null ? SocialProblems.GroupNotFound() : WolverineContinue.NoProblems;
}

/// <summary>Le corps du changement de créateur par l'admin : le pseudo du membre à qui confier le groupe.</summary>
public sealed record TransferAdminGroupOwner(string Pseudo);

public static class TransferAdminGroupOwnerEndpoint
{
    public static Task<AdminGroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        AdminGroupSteps.LoadAsync(id, current, store, ct);

    public static async Task<ProblemDetails> ValidateAsync(TransferAdminGroupOwner request, AdminGroupAction action, IPlayerDirectory players, CancellationToken ct)
    {
        var found = AdminGroupSteps.Validate(action);
        if (!ReferenceEquals(found, WolverineContinue.NoProblems))
            return found;
        var memberId = await GroupHandOver.FindMemberAsync(action.Group, request.Pseudo, players, ct);
        return memberId is { } id && action.Group!.CanTransferTo(id) ? WolverineContinue.NoProblems : SocialProblems.InvalidSuccessor();
    }

    /// <summary>
    /// <c>PUT /api/admin/social/groups/{id}/owner</c> : confie le groupe à un autre de ses membres, désigné par son pseudo (204). L'ancien créateur
    /// devient un simple membre. 400 <c>social.invalid_successor</c> si ce pseudo n'est pas celui d'un autre membre, 404 <c>social.group_not_found</c>.
    /// </summary>
    [WolverinePut("/api/admin/social/groups/{id}/owner", OperationId = "transferAdminGroupOwner")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task Put(TransferAdminGroupOwner request, [NotBody] AdminGroupAction action, IPlayerDirectory players, ILogger<Group> logger, CancellationToken ct)
    {
        var group = action.Group!;
        var newOwnerId = (await GroupHandOver.FindMemberAsync(group, request.Pseudo, players, ct))!.Value;
        group.TransferOwnership(newOwnerId);
        SocialLog.AdminOwnerTransferred(logger, group.Id, newOwnerId, action.AdminId);
    }
}

/// <summary>Le groupe chargé pour le retrait d'un membre, ce membre et le successeur que l'admin désigne (vides s'ils ne sont pas dans le groupe).</summary>
public sealed record AdminGroupRemoval(AdminGroupAction Action, Guid? MemberId, Guid? SuccessorId);

public static class RemoveAdminGroupMemberEndpoint
{
    public static async Task<AdminGroupRemoval> LoadAsync(
        int id, string pseudo, string? successor, ICurrentPlayer current, IGroupStore store, IPlayerDirectory players, CancellationToken ct)
    {
        var action = await AdminGroupSteps.LoadAsync(id, current, store, ct);
        var memberId = await GroupHandOver.FindMemberAsync(action.Group, pseudo, players, ct);
        return new AdminGroupRemoval(action, memberId, await GroupHandOver.FindMemberAsync(action.Group, successor, players, ct));
    }

    public static ProblemDetails Validate(AdminGroupRemoval removal, string? successor)
    {
        var found = AdminGroupSteps.Validate(removal.Action);
        if (!ReferenceEquals(found, WolverineContinue.NoProblems))
            return found;
        return removal.MemberId is { } memberId
            ? GroupHandOver.Check(removal.Action.Group!, memberId, successor, removal.SuccessorId)
            : SocialProblems.MemberNotFound();
    }

    /// <summary>
    /// <c>DELETE /api/admin/social/groups/{id}/members/{pseudo}?successor=pseudo</c> : retire un membre du groupe (204) ; le dernier membre retiré
    /// supprime le groupe et ses adhésions. Le créateur ne se retire pas tant qu'il reste d'autres membres : l'admin désigne en même temps le nouveau
    /// créateur (<c>successor</c>, le pseudo d'un autre membre), et le changement et le retrait se font ensemble ou pas du tout. 404
    /// <c>social.group_not_found</c> ou <c>social.member_not_found</c>, 409 <c>social.owner_must_hand_over</c>, 400 <c>social.invalid_successor</c>.
    /// </summary>
    [WolverineDelete("/api/admin/social/groups/{id}/members/{pseudo}", OperationId = "removeAdminGroupMember")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static void Delete([NotBody] AdminGroupRemoval removal, IGroupStore store, ILogger<Group> logger)
    {
        var (action, memberId) = (removal.Action, removal.MemberId!.Value);
        var group = action.Group!;
        if (group.MustHandOverBeforeLeaving(memberId))
        {
            group.TransferOwnership(removal.SuccessorId!.Value);
            SocialLog.AdminOwnerTransferred(logger, group.Id, removal.SuccessorId.Value, action.AdminId);
        }

        var departure = group.Leave(memberId);
        if (departure == GroupDeparture.Emptied)
            store.Remove(group);
        SocialLog.AdminMemberRemoved(logger, memberId, group.Id, action.AdminId, departure.ToString());
    }
}

public static class RenameAdminGroupEndpoint
{
    public static Task<AdminGroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        AdminGroupSteps.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(RenameGroup request, AdminGroupAction action, SocialRules rules)
    {
        var found = AdminGroupSteps.Validate(action);
        if (!ReferenceEquals(found, WolverineContinue.NoProblems))
            return found;
        return GroupName.IsValid(request.Name, rules.MaxNameLength) ? WolverineContinue.NoProblems : SocialProblems.InvalidName(rules.MaxNameLength);
    }

    /// <summary>
    /// <c>PUT /api/admin/social/groups/{id}/name</c> : donne un autre nom au groupe (mêmes caractères permis et même longueur que pour un
    /// joueur). 400 <c>social.invalid_name</c>, 404 <c>social.group_not_found</c>.
    /// </summary>
    [WolverinePut("/api/admin/social/groups/{id}/name", OperationId = "renameAdminGroup")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static GroupNameResponse Put(RenameGroup request, [NotBody] AdminGroupAction action, ILogger<Group> logger)
    {
        var group = action.Group!;
        group.Rename(request.Name);
        SocialLog.AdminRenamed(logger, group.Id, action.AdminId);
        return new GroupNameResponse(group.Name);
    }
}

public static class ResetAdminGroupNameEndpoint
{
    public static Task<AdminGroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        AdminGroupSteps.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(AdminGroupAction action) => AdminGroupSteps.Validate(action);

    /// <summary>
    /// <c>POST /api/admin/social/groups/{id}/name/reset</c> : remplace un nom inapproprié par le nom de remplacement (<see cref="GroupName.Replacement"/>,
    /// « Groupe 12 »), sans avoir à en inventer un. Rend le nouveau nom. 404 <c>social.group_not_found</c>.
    /// </summary>
    [WolverinePost("/api/admin/social/groups/{id}/name/reset", OperationId = "resetAdminGroupName")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static GroupNameResponse Post([NotBody] AdminGroupAction action, ILogger<Group> logger)
    {
        var group = action.Group!;
        group.Rename(GroupName.Replacement(group.Id));
        SocialLog.AdminNameReset(logger, group.Id, action.AdminId);
        return new GroupNameResponse(group.Name);
    }
}

public static class DeleteAdminGroupEndpoint
{
    public static Task<AdminGroupAction> LoadAsync(int id, ICurrentPlayer current, IGroupStore store, CancellationToken ct) =>
        AdminGroupSteps.LoadAsync(id, current, store, ct);

    public static ProblemDetails Validate(AdminGroupAction action) => AdminGroupSteps.Validate(action);

    /// <summary>
    /// <c>DELETE /api/admin/social/groups/{id}</c> : supprime le groupe et ses adhésions (204), quel qu'en soit le créateur ; les membres n'en
    /// retrouvent aucune trace (leurs comptes, eux, ne changent pas). 404 <c>social.group_not_found</c>.
    /// </summary>
    [WolverineDelete("/api/admin/social/groups/{id}", OperationId = "deleteAdminGroup")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static void Delete([NotBody] AdminGroupAction action, IGroupStore store, [NotBody] SocialMetrics metrics, ILogger<Group> logger)
    {
        store.Remove(action.Group!);
        SocialLog.AdminDeleted(logger, action.Group!.Id, action.AdminId);
        metrics.Group(SocialMetrics.AdminDeleted);
    }
}
