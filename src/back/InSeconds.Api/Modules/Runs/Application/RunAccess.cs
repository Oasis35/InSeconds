using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Qui peut lancer un run : un compte que l'admin a autorisé (<c>runs.access</c>), admin compris : le rôle ne donne rien d'office, un admin peut
/// se retirer l'accès pour voir le jeu sans Survie. Relever un défi existant demande le même accès : le lien d'un ami ne le remplace pas. Players
/// n'est pas modifié : l'accès est une affaire du mode.
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

/// <summary>Le défi d'ami à rappeler sur l'accueil : la playlist, son auteur et la fin de sa validité.</summary>
public sealed record RunReceivedEntry(int ChallengeId, string Code, Guid? AuthorId, DateTimeOffset ExpiresAt);

public interface IRunsQueries
{
    /// <summary>Les comptes autorisés par l'admin, admins compris.</summary>
    Task<IReadOnlyList<RunAccessEntry>> ListAccessAsync(CancellationToken ct);

    /// <summary>La partie en cours la plus récente de ce joueur, toutes playlists confondues.</summary>
    Task<RunSessionEntry?> FindPendingSessionAsync(Guid playerId, CancellationToken ct);

    /// <summary>Le défi d'ami reçu le plus récent de ce joueur qui reste à jouer : ni refusé, ni expiré, ni déjà joué.</summary>
    Task<RunReceivedEntry?> FindPendingReceivedChallengeAsync(Guid playerId, DateTimeOffset now, CancellationToken ct);

    /// <summary>La partie de ce joueur sur ce défi.</summary>
    Task<RunSessionEntry?> FindSessionAsync(int challengeId, Guid playerId, CancellationToken ct);

    Task<RunRecord?> FindRecordAsync(Guid playerId, CancellationToken ct);

    /// <summary>
    /// Ce que ce joueur a entendu dans ses <paramref name="maxGames"/> parties les plus récentes (toutes, abandonnées comprises), hors la playlist
    /// <paramref name="exceptChallengeId"/> : ses morceaux répondus (un morceau retiré sans extrait n'a pas été entendu) et les thèmes de ses manches,
    /// du plus récent au plus ancien. La mémoire de la diversité du tirage (<see cref="RunDiversity"/>) : lue dans ses parties, rien n'est stocké à part.
    /// </summary>
    Task<RunHeardHistory> GetHeardHistoryAsync(Guid playerId, int? exceptChallengeId, int maxGames, CancellationToken ct);

    /// <summary>Le niveau de ce joueur ; vide avant sa première partie finie.</summary>
    Task<RunLevel?> FindLevelAsync(Guid playerId, CancellationToken ct);

    /// <summary>
    /// Les points de chaque morceau de la partie finie (vies épuisées) de ce joueur sur ce défi, par position ; <c>null</c> s'il ne l'a pas finie
    /// (le fantôme d'un ami).
    /// </summary>
    Task<IReadOnlyDictionary<int, int>?> FindFinishedPointsAsync(int challengeId, Guid playerId, CancellationToken ct);

    /// <summary>Les parties terminées (vies épuisées) de ce défi, avec leurs réponses, en lecture seule : la comparaison.</summary>
    Task<IReadOnlyList<RunSession>> ListFinishedSessionsAsync(int challengeId, CancellationToken ct);
}

public static class ListRunAccessEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/runs/access</c> : les comptes autorisés, admins compris, en un appel pour tous les interrupteurs de l'onglet Joueurs.
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
    /// se vérifie au lancement d'un run et au départ sur une playlist.
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
