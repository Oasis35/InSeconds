using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Qui peut lancer un run : un admin d'office (le rôle est relu en base par la validation du cookie), ou un compte que l'admin a autorisé
/// (<c>runs.access</c>). Relever un défi existant ne demande pas d'accès : il suffit d'avoir le lien. Players n'est pas modifié : l'accès est une
/// affaire du mode.
/// </summary>
public interface IRunAccess
{
    Task<bool> CanPlayAsync(Guid playerId, CancellationToken ct);
}

/// <param name="PlayerId">Le compte autorisé.</param>
/// <param name="GrantedAt">Quand l'admin l'a autorisé.</param>
public sealed record RunAccessEntry(Guid PlayerId, DateTimeOffset GrantedAt);

public sealed record RunAccessList(IReadOnlyList<RunAccessEntry> Entries);

/// <summary>La partie d'un joueur sur un défi, telle que le lien et l'accueil la voient.</summary>
public sealed record RunSessionEntry(int SessionId, string ChallengeCode, RunSessionStatus Status);

public interface IRunsQueries
{
    /// <summary>Les comptes autorisés par l'admin (les admins, qui ont l'accès d'office, n'y figurent que s'ils ont aussi une ligne).</summary>
    Task<IReadOnlyList<RunAccessEntry>> ListAccessAsync(CancellationToken ct);

    /// <summary>La partie en cours la plus récente de ce joueur, toutes playlists confondues.</summary>
    Task<RunSessionEntry?> FindPendingSessionAsync(Guid playerId, CancellationToken ct);

    /// <summary>La partie de ce joueur sur ce défi.</summary>
    Task<RunSessionEntry?> FindSessionAsync(int challengeId, Guid playerId, CancellationToken ct);

    Task<RunRecord?> FindRecordAsync(Guid playerId, CancellationToken ct);
}

public static class ListRunAccessEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/runs/access</c> : les comptes autorisés, en un appel pour tous les interrupteurs de l'onglet Joueurs. L'accès d'un admin
    /// est d'office : l'onglet le déduit du rôle, pas de cette liste.
    /// </summary>
    [WolverineGet("/api/admin/runs/access", OperationId = "listRunAccess")]
    public static async Task<RunAccessList> Get(IRunsQueries queries, CancellationToken ct) => new(await queries.ListAccessAsync(ct));
}

/// <summary>Le joueur est-il un compte (un invité, un joueur inconnu ou supprimé n'a rien à autoriser) ?</summary>
public sealed record AccessTarget(bool IsAccount, RunAccess? Existing);

internal static class RunAccessSteps
{
    public static async Task<AccessTarget> LoadAsync(Guid playerId, IPlayerDirectory players, IRunsStore store, CancellationToken ct) =>
        new(await players.HasAccountAsync(playerId, ct), await store.FindAccessAsync(playerId, ct));

    public static ProblemDetails Validate(AccessTarget target) =>
        target.IsAccount ? WolverineContinue.NoProblems : ApiProblem.Of(StatusCodes.Status404NotFound, ErrorCodes.NotFound, "Compte introuvable.");
}

public static class GrantRunAccessEndpoint
{
    public static Task<AccessTarget> LoadAsync(Guid playerId, IPlayerDirectory players, IRunsStore store, CancellationToken ct) =>
        RunAccessSteps.LoadAsync(playerId, players, store, ct);

    public static ProblemDetails Validate(AccessTarget target) => RunAccessSteps.Validate(target);

    /// <summary>
    /// <c>PUT /api/admin/runs/access/{playerId}</c> : autorise ce compte à lancer des runs. Idempotent (déjà autorisé : rien ne change, la date
    /// d'origine reste). Un invité, un joueur inconnu : 404 <c>common.not_found</c>.
    /// </summary>
    [WolverinePut("/api/admin/runs/access/{playerId}", OperationId = "grantRunAccess")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static void Put(Guid playerId, [NotBody] AccessTarget target, IRunsStore store, TimeProvider time, ILogger<RunAccess> logger)
    {
        if (target.Existing is not null)
            return;
        store.AddAccess(RunAccess.Grant(playerId, time.GetUtcNow()));
        RunsLog.AccessGranted(logger, playerId);
    }
}

public static class RevokeRunAccessEndpoint
{
    public static Task<AccessTarget> LoadAsync(Guid playerId, IPlayerDirectory players, IRunsStore store, CancellationToken ct) =>
        RunAccessSteps.LoadAsync(playerId, players, store, ct);

    public static ProblemDetails Validate(AccessTarget target) => RunAccessSteps.Validate(target);

    /// <summary>
    /// <c>DELETE /api/admin/runs/access/{playerId}</c> : retire l'autorisation. Idempotent. Une partie en cours n'est pas touchée : l'accès ne
    /// se vérifie qu'au lancement d'un run.
    /// </summary>
    [WolverineDelete("/api/admin/runs/access/{playerId}", OperationId = "revokeRunAccess")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static void Delete([NotBody] AccessTarget target, IRunsStore store, ILogger<RunAccess> logger)
    {
        if (target.Existing is null)
            return;
        store.RemoveAccess(target.Existing);
        RunsLog.AccessRevoked(logger, target.Existing.PlayerId);
    }
}
