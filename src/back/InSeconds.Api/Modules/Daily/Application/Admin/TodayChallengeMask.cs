using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <param name="Hidden">Le défi du jour est masqué à cet admin : il ne l'a pas fini et ne l'a pas affiché.</param>
/// <param name="Date">Le jour du défi masqué ; vide quand rien n'est masqué.</param>
public sealed record TodayChallengeMaskResponse(bool Hidden, DateOnly? Date)
{
    public static readonly TodayChallengeMaskResponse Visible = new(false, null);
}

/// <summary>
/// Le défi du jour **masqué à un admin** tant qu'il n'a pas fini sa partie (terminée, abandonnée ou expirée) : l'onglet Défis cache ses morceaux.
/// Le pool et la story de la semaine ne sont jamais masqués. « Afficher quand même »
/// (<see cref="ChallengeReveal"/>) le montre tout de suite, et sa partie de ce défi sort des statistiques.
/// </summary>
public static class TodayChallengeMask
{
    public static bool IsHidden(SessionStatus? ownSession, bool revealed) =>
        !revealed && ownSession is null or SessionStatus.Pending;

    /// <summary>Le défi du jour est masqué à ce joueur ; jamais sans défi ce jour-là ni sans identité.</summary>
    public static async Task<bool> IsHiddenAsync(Guid? playerId, IDailyStatsQueries stats, IGameCalendar calendar, CancellationToken ct) =>
        playerId is { } id && await stats.GetChallengeMaskAsync(calendar.Today, id, ct) is { } row && IsHidden(row.OwnSession, row.Revealed);
}

public static class GetTodayChallengeMaskEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/daily/today-mask</c> : le défi du jour est-il masqué à cet admin. Le masque ne vaut que dans l'admin, à ses propres yeux :
    /// les réponses des autres routes admin ne changent pas, l'onglet Défis cache le jour masqué.
    /// </summary>
    [WolverineGet("/api/admin/daily/today-mask", OperationId = "getTodayChallengeMask")]
    public static async Task<TodayChallengeMaskResponse> Get(ICurrentPlayer current, IDailyStatsQueries stats, IGameCalendar calendar, CancellationToken ct) =>
        await TodayChallengeMask.IsHiddenAsync(current.PlayerId, stats, calendar, ct)
            ? new TodayChallengeMaskResponse(true, calendar.Today)
            : TodayChallengeMaskResponse.Visible;
}

/// <param name="Masked">Le défi du jour, s'il est encore masqué à cet admin ; vide sinon (pas de défi, partie finie, déjà affiché).</param>
public sealed record RevealLoad(ChallengeMaskRow? Masked);

public static class RevealTodayChallengeEndpoint
{
    public static async Task<RevealLoad> LoadAsync(ICurrentPlayer current, IDailyStatsQueries stats, IGameCalendar calendar, CancellationToken ct) =>
        new(current.PlayerId is { } playerId && await stats.GetChallengeMaskAsync(calendar.Today, playerId, ct) is { } row
            && TodayChallengeMask.IsHidden(row.OwnSession, row.Revealed)
                ? row
                : null);

    /// <summary>
    /// <c>POST /api/admin/daily/today-mask/reveal</c> : « Afficher quand même ». Le défi du jour n'est plus masqué à cet admin, et **sa partie de
    /// ce défi sort de toutes les statistiques** (publiques et admin), qu'elle soit commencée ou non : il la joue en connaissant les réponses.
    /// Sans effet (204) quand rien n'est masqué : pas de défi aujourd'hui, déjà affiché, ou partie déjà finie (jouée sans connaître les
    /// réponses, elle reste comptée, même si le clic part d'un onglet resté ouvert).
    /// </summary>
    [WolverinePost("/api/admin/daily/today-mask/reveal", OperationId = "revealTodayChallenge")]
    [EmptyResponse]
    public static void Post([NotBody] RevealLoad loaded, ICurrentPlayer current, IDailyStore store, IGameCalendar calendar)
    {
        if (loaded.Masked is not { } masked || current.PlayerId is not { } playerId)
            return;
        store.Add(ChallengeReveal.Create(masked.ChallengeId, playerId, calendar.Now));
    }
}
