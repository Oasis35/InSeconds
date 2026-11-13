using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Social.Application;

// Modération des groupes, dans l'onglet Groupes de l'admin. Toute route /api/admin* reçoit la policy Admin automatiquement (401 sans joueur, 403 sans le
// rôle). L'admin voit le nom, le nombre de membres, le créateur (son pseudo) et la date : jamais le code d'invitation (un secret qui donne l'accès), ni
// la liste des membres.

/// <param name="OwnerPseudo">Le pseudo du créateur (toujours un compte) ; vide s'il est introuvable.</param>
public sealed record AdminGroupResponse(int Id, string Name, int MemberCount, Guid OwnerId, string? OwnerPseudo, DateTimeOffset CreatedAt);

public sealed record AdminGroupsResponse(IReadOnlyList<AdminGroupResponse> Groups);

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
