using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Le nombre de parties terminées depuis le début du jeu.</summary>
/// <param name="CompletedGames">Parties terminées, tous jours confondus, joueurs supprimés exclus. Le front l'arrondit à la dizaine inférieure.</param>
public sealed record GamesPlayedResponse(int CompletedGames);

public static class GetGamesPlayedEndpoint
{
    /// <summary>
    /// <c>GET /api/daily/stats/games-played</c> : public. Le chiffre du message de remerciement (« les plus de 2 550 parties jouées »),
    /// lu une seule fois par navigateur. Un seul chiffre, rien qui identifie un joueur ni un morceau.
    /// </summary>
    [WolverineGet("/api/daily/stats/games-played", OperationId = "getGamesPlayed")]
    public static async Task<GamesPlayedResponse> Get(IDailyStatsQueries stats, CancellationToken ct) =>
        new(await stats.CountCompletedSessionsAsync(ct));
}
