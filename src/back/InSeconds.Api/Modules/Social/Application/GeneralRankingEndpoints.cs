using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Social.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Social.Application;

public static class GetGeneralRankingEndpoint
{
    /// <summary>
    /// <c>GET /api/social/ranking</c> : le classement général, pour tout joueur identifié : ses 20 premiers, puis le joueur et ses deux voisins s'il a
    /// choisi d'y apparaître, et sa position par dizaines dans tous les cas. Seuls les comptes qui l'ont choisi y ont leur pseudo ; personne n'y
    /// figure par défaut.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/social/ranking", OperationId = "getGeneralRanking")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<GeneralRankingResponse> Get(
        ICurrentPlayer current, ISocialQueries queries, GroupRanking ranking, IPlayerDirectory players, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var visibleIds = await queries.ListRankingVisiblePlayersAsync(ct);
        var isVisible = visibleIds.Contains(playerId);
        var rows = await ranking.RankAsync(visibleIds, ct);
        // Celui qui n'apparaît pas est classé seul, pour situer sa position sans l'ajouter à la liste.
        var viewer = isVisible ? null : (await ranking.RankAsync([playerId], ct)).FirstOrDefault();
        var view = GeneralRankingPolicy.Build(rows, playerId, viewer);
        return new GeneralRankingResponse(
            [.. view.Top.Select(r => EntryOf(r, playerId))], [.. view.Around.Select(r => EntryOf(r, playerId))], view.Total, isVisible,
            await players.HasAccountAsync(playerId, ct), view.TopPercent);
    }

    private static RankingEntryResponse EntryOf(RankingRow row, Guid playerId) =>
        new(row.Rank, row.Pseudo, row.PlayerId == playerId, row.Performance, row.GamesPlayed, row.BestScore, row.Points, row.Badge);
}

/// <summary>Le corps du choix de visibilité.</summary>
public sealed record SetRankingVisibility(bool Visible);

/// <summary>Ce que le choix a trouvé : le compte du joueur et son choix actuel.</summary>
public sealed record RankingVisibilityChoice(Guid PlayerId, bool HasAccount, RankingVisibility? Current);

public static class SetRankingVisibilityEndpoint
{
    public static async Task<RankingVisibilityChoice> LoadAsync(
        ICurrentPlayer current, IPlayerDirectory players, IRankingVisibilityStore store, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        return new RankingVisibilityChoice(playerId, await players.HasAccountAsync(playerId, ct), await store.FindAsync(playerId, ct));
    }

    public static ProblemDetails Validate(RankingVisibilityChoice choice) =>
        choice.HasAccount ? WolverineContinue.NoProblems : SocialProblems.AccountRequired();

    /// <summary>
    /// <c>PUT /api/social/ranking/visibility</c> : apparaître ou non dans le classement général (pseudo, points et disque visibles de tous les
    /// joueurs). Réservé à un compte : 403 <c>social.account_required</c> ; 429 au-delà de 20 écritures en 10 minutes.
    /// </summary>
    [Authorize]
    [WolverinePut("/api/social/ranking/visibility", OperationId = "setRankingVisibility")]
    [EmptyResponse]
    [EnableRateLimiting(RateLimitPolicies.SocialWrite)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static void Put(
        SetRankingVisibility request, [NotBody] RankingVisibilityChoice choice, IRankingVisibilityStore store, SocialMetrics metrics, TimeProvider time,
        ILogger<RankingVisibility> logger)
    {
        if (request.Visible && choice.Current is null)
            store.Add(new RankingVisibility(choice.PlayerId, time.GetUtcNow()));
        else if (!request.Visible && choice.Current is not null)
            store.Remove(choice.Current);
        else
            return;
        SocialLog.RankingVisibilityChanged(logger, choice.PlayerId, request.Visible);
        metrics.RankingVisibilityChanged(request.Visible);
    }
}
