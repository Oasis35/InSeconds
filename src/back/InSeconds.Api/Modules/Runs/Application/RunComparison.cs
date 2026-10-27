using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Une partie terminée d'une playlist, vue par un autre joueur de cette playlist : jamais un morceau (piège 31), seulement des scores.</summary>
/// <param name="Pseudo">Le pseudo du joueur ; vide pour un invité (« Invité » à l'écran).</param>
/// <param name="Rounds">Le score de chaque manche de la playlist, dans l'ordre ; vide pour une manche non jouée (✕ à l'écran).</param>
/// <param name="IsMe">C'est la partie du joueur qui regarde (« Toi »).</param>
public sealed record RunComparisonRowResponse(string? Pseudo, RunDiscResponse Disc, IReadOnlyList<int?> Rounds, int TotalScore, bool IsMe);

/// <summary>La comparaison des joueurs d'une playlist (écran de comparaison).</summary>
/// <param name="AuthorPseudo">Le pseudo de son auteur ; vide pour un invité ou un compte effacé (« Invité » à l'écran).</param>
/// <param name="PlayerCount">Les parties terminées (gagnées ou perdues) de cette playlist.</param>
/// <param name="RoundCount">Les manches de la playlist (règles figées) : les colonnes M1 à Mn.</param>
/// <param name="Rows">Une ligne par partie terminée, triée par total (à égalité : plus de manches passées, puis la première terminée).</param>
public sealed record RunComparisonResponse(string Code, string? AuthorPseudo, int PlayerCount, int RoundCount, IReadOnlyList<RunComparisonRowResponse> Rows);

/// <summary>Ce que la comparaison a trouvé : la playlist et la partie du joueur qui la demande, s'il en a une.</summary>
public sealed record RunComparisonLoad(RunChallenge? Challenge, RunSessionEntry? Mine);

public static class GetRunComparisonEndpoint
{
    public static async Task<RunComparisonLoad> LoadAsync(string code, ICurrentPlayer current, IRunsStore store, IRunsQueries queries, CancellationToken ct)
    {
        var challenge = await RunChallengeAccess.FindAsync(code, store, ct);
        var mine = challenge is not null && current.PlayerId is { } playerId ? await queries.FindSessionAsync(challenge.Id, playerId, ct) : null;
        return new RunComparisonLoad(challenge, mine);
    }

    public static ProblemDetails Validate(RunComparisonLoad load)
    {
        if (load.Challenge is null)
            return RunsProblems.ChallengeNotFound();
        // On ne compare qu'après avoir joué. Une partie abandonnée est finie (la playlist ne se rejoue pas).
        return load.Mine is null or { Status: RunSessionStatus.Pending } ? RunsProblems.ComparisonLocked() : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>GET /api/runs/challenges/{code}/comparison</c> : les parties terminées de la playlist, après la fin de sa propre partie. 404
    /// <c>runs.challenge_not_found</c> pour un code inconnu, 409 <c>runs.comparison_locked</c> tant que sa propre partie n'est pas finie (ou
    /// n'existe pas), 401 sans identité, 429 au-delà de 60 lectures en 5 minutes par IP. Des scores, jamais un morceau (piège 31).
    /// </summary>
    [Authorize]
    [WolverineGet("/api/runs/challenges/{code}/comparison", OperationId = "getRunComparison")]
    [EnableRateLimiting(RateLimitPolicies.RunLink)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static async Task<RunComparisonResponse> Get(
        [NotBody] RunComparisonLoad load, ICurrentPlayer current, IRunsQueries queries, IPlayerDirectory players, IRunScoringPolicy scoring, RunsRules rules, CancellationToken ct)
    {
        var challenge = load.Challenge!;
        var sessions = await queries.ListFinishedSessionsAsync(challenge.Id, ct);
        var rounds = challenge.Tracks.Select(t => (int)t.Round).Distinct().Order().ToList();

        var ids = sessions.Select(s => s.PlayerId).ToList();
        if (challenge.CreatedBy is { } createdBy)
            ids.Add(createdBy);
        var pseudos = await players.GetPseudosAsync(ids.Distinct().ToList(), ct);

        var rows = sessions
            .OrderByDescending(s => s.TotalScore)
            .ThenByDescending(s => s.RoundsPassed)
            .ThenBy(s => s.EndedAt)
            .ThenBy(s => s.Id)
            .Select(s => new RunComparisonRowResponse(
                pseudos.GetValueOrDefault(s.PlayerId),
                Disc(s, rules.Discs),
                rounds.Select(r => RoundScore(s, challenge, r, scoring)).ToList(),
                s.TotalScore,
                s.PlayerId == current.PlayerId))
            .ToList();

        return new RunComparisonResponse(
            challenge.Code, challenge.CreatedBy is { } author ? pseudos.GetValueOrDefault(author) : null, rows.Count, rounds.Count, rows);
    }

    private static RunDiscResponse Disc(RunSession session, IReadOnlyList<string> discs)
    {
        var disc = DiscLadder.Of(session.RoundsPassed, discs);
        return new RunDiscResponse(disc.Key, disc.Stars);
    }

    /// <summary>Le score de la manche si elle a été jouée (au moins un morceau répondu), sinon vide.</summary>
    private static int? RoundScore(RunSession session, RunChallenge challenge, int round, IRunScoringPolicy scoring)
    {
        var played = challenge.Tracks.Any(t => t.Round == round && session.Answers.Any(a => a.Position == t.Position));
        return played ? session.RoundProgressOf(challenge, round, scoring).Score : null;
    }
}
