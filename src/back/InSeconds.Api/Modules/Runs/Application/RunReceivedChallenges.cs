using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

// Les défis d'amis reçus : un compte qui ouvre le lien d'une playlist lancée par un autre joueur, sans l'avoir jouée, la garde sur son accueil
// (« Léa t'a défié ») pendant 7 jours, sauf s'il la joue ou la refuse. Lié au compte côté serveur : un invité n'en a pas (le lien suffit à le faire jouer).

/// <summary>Le défi de l'ami à rappeler sur l'accueil.</summary>
/// <param name="Code">Le lien de la playlist.</param>
/// <param name="AuthorPseudo">Son auteur ; vide si son compte a disparu.</param>
/// <param name="ScoreToBeat">Le total de l'auteur sur cette playlist s'il l'a finie ; vide sinon.</param>
/// <param name="ExpiresAt">La fin de la validité du défi (7 jours après sa réception).</param>
public sealed record RunReceivedChallengeResponse(string Code, string? AuthorPseudo, int? ScoreToBeat, DateTimeOffset ExpiresAt);

/// <summary>Ce que la réception d'un lien a trouvé : le joueur, la playlist, et ce qui existe déjà.</summary>
public sealed record ReceivedLoad(Guid PlayerId, RunChallenge? Challenge, bool IsAccount, bool AlreadyPlayed, RunReceivedChallenge? Existing);

internal static class ReceivedLoadSteps
{
    public static async Task<ReceivedLoad> LoadAsync(
        string code, ICurrentPlayer current, IRunsStore store, IPlayerDirectory players, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var challenge = await RunChallengeAccess.FindAsync(code, store, ct);
        if (challenge is null)
            return new ReceivedLoad(playerId, null, false, false, null);

        var isAccount = await players.HasAccountAsync(playerId, ct);
        var played = await store.FindSessionAsync(challenge.Id, playerId, ct) is not null;
        return new ReceivedLoad(playerId, challenge, isAccount, played, await store.FindReceivedChallengeAsync(playerId, challenge.Id, ct));
    }

    public static ProblemDetails Validate(ReceivedLoad load) => load.Challenge is null ? RunsProblems.ChallengeNotFound() : WolverineContinue.NoProblems;
}

public static class ReceiveRunChallengeEndpoint
{
    public static Task<ReceivedLoad> LoadAsync(string code, ICurrentPlayer current, IRunsStore store, IPlayerDirectory players, CancellationToken ct) =>
        ReceivedLoadSteps.LoadAsync(code, current, store, players, ct);

    public static ProblemDetails Validate(ReceivedLoad load) => ReceivedLoadSteps.Validate(load);

    /// <summary>
    /// <c>POST /api/runs/challenges/{code}/received</c> : le front l'appelle quand un compte ouvre le lien d'une playlist qu'il n'a pas encore
    /// jouée. Garde le défi sur son accueil pour 7 jours. Ne fait rien (204 tout de même) pour un invité, pour sa propre playlist, pour une playlist
    /// sans auteur, déjà jouée, déjà reçue ou refusée : ouvrir le lien deux fois ne prolonge rien et ne ressuscite pas un défi refusé. 404
    /// <c>runs.challenge_not_found</c> pour un code inconnu.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/challenges/{code}/received", OperationId = "receiveRunChallenge")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static void Post([NotBody] ReceivedLoad load, IRunsStore store, TimeProvider time)
    {
        var challenge = load.Challenge!;
        if (!load.IsAccount || load.AlreadyPlayed || load.Existing is not null || !RunGhost.Haunts(challenge.CreatedBy, load.PlayerId))
            return;
        store.AddReceivedChallenge(RunReceivedChallenge.Receive(load.PlayerId, challenge.Id, time.GetUtcNow()));
    }
}

public static class DismissRunChallengeEndpoint
{
    public static Task<ReceivedLoad> LoadAsync(string code, ICurrentPlayer current, IRunsStore store, IPlayerDirectory players, CancellationToken ct) =>
        ReceivedLoadSteps.LoadAsync(code, current, store, players, ct);

    public static ProblemDetails Validate(ReceivedLoad load) => ReceivedLoadSteps.Validate(load);

    /// <summary>
    /// <c>POST /api/runs/challenges/{code}/received/dismiss</c> : la croix du bandeau, le joueur refuse ce défi. Idempotent ; rien à refuser : 204
    /// aussi. 404 <c>runs.challenge_not_found</c> pour un code inconnu.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/runs/challenges/{code}/received/dismiss", OperationId = "dismissRunChallenge")]
    [EmptyResponse]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static void Post([NotBody] ReceivedLoad load, TimeProvider time) => load.Existing?.Dismiss(time.GetUtcNow());
}

/// <summary>Compose le défi d'ami à rappeler sur l'accueil à partir de la ligne trouvée.</summary>
public sealed class RunReceivedChallenges(IRunsQueries queries, IPlayerDirectory players)
{
    public async Task<RunReceivedChallengeResponse?> PendingAsync(Guid playerId, DateTimeOffset now, CancellationToken ct)
    {
        var entry = await queries.FindPendingReceivedChallengeAsync(playerId, now, ct);
        if (entry is null)
            return null;

        string? pseudo = null;
        int? score = null;
        if (entry.AuthorId is { } author)
        {
            pseudo = (await players.GetDisplayNamesAsync([author], ct)).GetValueOrDefault(author);
            score = (await queries.FindFinishedPointsAsync(entry.ChallengeId, author, ct))?.Values.Sum();
        }

        return new RunReceivedChallengeResponse(entry.Code, pseudo, score, entry.ExpiresAt);
    }
}
