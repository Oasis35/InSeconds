using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Lecture des Hits d'un joueur, en projections directes. Toujours **les parties de ce joueur** ; d'un ami, seulement ses points sur une playlist partagée.</summary>
public interface IRunHitsQueries
{
    Task<RunHitFacts> GetFactsAsync(Guid playerId, CancellationToken ct);
}

/// <summary>Un Hit du joueur.</summary>
/// <param name="Key">Son nom d'API, stable (<c>first_setlist</c>, <c>ten_setlists</c>…) : le front le traduit.</param>
/// <param name="Progress">Pour un Hit qui se compte : où en est le joueur, plafonné à <paramref name="Target"/> ; vide sinon.</param>
public sealed record RunHitResponse(string Key, bool Earned, int? Progress, int? Target);

/// <summary>Les Hits du joueur, dans l'ordre de l'écran, et combien il en a.</summary>
public sealed record RunHitsResponse(IReadOnlyList<RunHitResponse> Hits, int EarnedCount);

public static class GetRunHitsEndpoint
{
    /// <summary>
    /// <c>GET /api/runs/hits</c> : les Hits du **joueur de la requête**, calculés sur ses parties finies. Lecture seule, rien n'est stocké ; aucun
    /// morceau, aucun pseudo. Pas d'accès au mode demandé : ce sont ses propres parties. 401 sans identité.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/runs/hits", OperationId = "getRunHits")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<RunHitsResponse> Get(ICurrentPlayer current, IRunHitsQueries queries, RunsRules rules, CancellationToken ct)
    {
        var levels = rules.Levels;
        var hits = RunHits.Evaluate(await queries.GetFactsAsync(current.PlayerId!.Value, ct), levels.Window, levels.ProvisionalRuns, levels.Ladder);
        return new RunHitsResponse(
            hits.Select(h => new RunHitResponse(h.Key, h.Earned, h.Progress, h.Target)).ToList(),
            hits.Count(h => h.Earned));
    }
}
