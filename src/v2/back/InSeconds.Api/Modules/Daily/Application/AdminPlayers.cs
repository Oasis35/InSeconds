using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <param name="LastSeenAt">Dernière visite sur le site (cookie), pas seulement le dernier lien magique ; vide si jamais vu.</param>
/// <param name="GamesPlayed">Parties terminées.</param>
/// <param name="CurrentStreak">Série **effective** (0 si cassée), pas la valeur stockée qui reste figée tant que le joueur ne rejoue pas.</param>
/// <param name="StreakFreezes">Gels en stock, déduction faite de ceux déjà engagés sur les jours manqués d'une série protégée.</param>
/// <param name="StreakProtected">Des jours manqués sont couverts par les gels.</param>
public sealed record AdminPlayer(
    Guid Id, string Pseudo, string Email, DateTimeOffset CreatedAt, DateTimeOffset? LastSeenAt, int GamesPlayed, bool IsAdmin,
    int CurrentStreak, int StreakFreezes, bool StreakProtected);

public sealed record AdminPlayersResponse(IReadOnlyList<AdminPlayer> Players);

public static class ListRegisteredPlayersEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/players</c> (v1 : même route) : les comptes inscrits (les invités et les joueurs supprimés n'y figurent pas), les plus
    /// récemment vus d'abord, jamais vus en dernier. Les comptes viennent de Players, la série et les parties de Daily : la route est dans Daily,
    /// seul des deux modules à pouvoir lire l'autre (par ses contrats). La série est celle d'**aujourd'hui** (<see cref="DailyStreak.Compute"/>).
    /// </summary>
    [WolverineGet("/api/admin/players", OperationId = "listRegisteredPlayers")]
    public static async Task<AdminPlayersResponse> Get(
        IPlayerDirectory players, IDailyStatsQueries stats, DailyRules rules, IGameCalendar calendar, CancellationToken ct)
    {
        var accounts = await players.ListAccountsAsync(ct);
        var ids = accounts.Select(a => a.PlayerId).ToList();
        var games = await stats.GetCompletedCountsByPlayerAsync(ids, ct);
        var streaks = await stats.GetStreaksAsync(ids, ct);
        var today = calendar.Today;

        var result = accounts.Select(a =>
        {
            var row = streaks.GetValueOrDefault(a.PlayerId);
            var view = row is null
                ? DailyStreak.None(today, isLinked: true, rules.Streak)
                : DailyStreak.Compute(row.CurrentStreak, row.LastPlayedDate, row.Freezes, today, isLinked: true, rules.Streak);
            return new AdminPlayer(
                a.PlayerId, a.Pseudo, a.Email, a.CreatedAt, a.LastSeenAt, games.GetValueOrDefault(a.PlayerId), a.IsAdmin,
                view.Streak, view.Freezes, view.Status == StreakStatus.Protected);
        }).ToList();

        return new AdminPlayersResponse(result);
    }
}

/// <summary>
/// Une partie du joueur. <paramref name="Status"/> : <c>Completed</c>, <c>Pending</c> (en cours, aujourd'hui), <c>Abandoned</c> (bouton) ou
/// <c>Expired</c> (en cours sur un jour passé : le joueur n'est jamais revenu). <paramref name="Score"/> vide hors <c>Completed</c>.
/// </summary>
public sealed record AdminPlayerGame(DateOnly Date, string Status, int? Score, int FreezesUsed, bool FreezeEarned);

public sealed record AdminPlayerHistoryResponse(IReadOnlyList<AdminPlayerGame> Games);

/// <summary>Le joueur demandé existe-t-il (non supprimé) ?</summary>
public sealed record KnownPlayer(bool Exists);

public static class GetPlayerHistoryEndpoint
{
    /// <summary>Les jours montrés (v1 : 30, aujourd'hui compris).</summary>
    public const int HistoryDays = 30;

    public static async Task<KnownPlayer> LoadAsync(Guid playerId, IPlayerDirectory players, CancellationToken ct) =>
        new(await players.ExistsAsync(playerId, ct));

    public static ProblemDetails Validate(KnownPlayer player) =>
        player.Exists ? WolverineContinue.NoProblems : ApiProblem.Of(StatusCodes.Status404NotFound, ErrorCodes.NotFound, "Joueur introuvable.");

    /// <summary>
    /// <c>GET /api/admin/daily/players/{playerId}/history</c> (v1 : <c>GET /api/admin/players/{id}/history</c>) : les parties des 30 derniers jours,
    /// la plus récente d'abord. Lu à l'ouverture d'une ligne de l'onglet Joueurs. 404 pour un joueur inconnu ou supprimé.
    /// </summary>
    [WolverineGet("/api/admin/daily/players/{playerId}/history", OperationId = "getPlayerHistory")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<AdminPlayerHistoryResponse> Get(
        Guid playerId, IDailyStatsQueries stats, IGameCalendar calendar, CancellationToken ct)
    {
        var today = calendar.Today;
        var rows = await stats.GetPlayerHistoryAsync(playerId, today.AddDays(-(HistoryDays - 1)), ct);

        return new AdminPlayerHistoryResponse(rows.Select(r =>
        {
            // Un jour passé n'a plus de partie « en cours » : celle-là n'a jamais été reprise.
            var status = r.Status == SessionStatus.Pending && r.Date < today ? SessionStatus.Expired : r.Status;
            return new AdminPlayerGame(r.Date, status.ToString(), status == SessionStatus.Completed ? r.TotalScore : null, r.FreezesUsed, r.FreezeEarned);
        }).ToList());
    }
}
