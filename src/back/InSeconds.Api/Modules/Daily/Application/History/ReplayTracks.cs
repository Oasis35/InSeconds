using System.Globalization;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Ce qu'on garde d'une réponse ratée : le jour du défi, la position, le morceau et les deux verdicts. Jamais ce que le joueur a tapé.</summary>
public sealed record MissedAnswer(DateOnly Date, int Position, int TrackId, bool ArtistCorrect, bool TitleCorrect);

/// <summary>Les filtres de « À réécouter ».</summary>
public static class ReplayFilters
{
    /// <summary>Tout ce qui n'a pas été entièrement trouvé.</summary>
    public const string All = "all";

    /// <summary>Ni l'artiste ni le titre.</summary>
    public const string None = "none";

    /// <summary>L'un des deux seulement.</summary>
    public const string Half = "half";

    public static bool IsKnown(string? filter) => filter is null or All or None or Half;
}

/// <summary>Un morceau raté à réécouter.</summary>
/// <param name="Position">Sa position dans le défi : l'extrait se demande à <c>/api/daily/archive/{date}/tracks/{position}/preview</c>.</param>
public sealed record ReplayTrackResponse(int Position, string Artist, string Title, long DeezerTrackId, string? CoverUrl, bool ArtistCorrect, bool TitleCorrect);

/// <summary>Les morceaux ratés d'un jour.</summary>
public sealed record ReplayDayResponse(DateOnly Date, IReadOnlyList<ReplayTrackResponse> Tracks);

/// <summary>« À réécouter » : les morceaux ratés du joueur, par jour, du plus récent au plus ancien, une page à la fois.</summary>
/// <param name="Days">Les jours de la page (au plus <see cref="GetReplayTracksEndpoint.DaysPerPage"/>).</param>
/// <param name="NextBefore">Le jour à passer en <c>before</c> pour la page suivante ; vide s'il n'y en a plus.</param>
/// <param name="AllCount">Ses réponses ratées, tous jours confondus (le compteur du filtre « Tous »).</param>
/// <param name="NoneCount">Celles où il n'a rien trouvé.</param>
/// <param name="HalfCount">Celles où il a trouvé l'artiste ou le titre, pas les deux.</param>
public sealed record ReplayResponse(IReadOnlyList<ReplayDayResponse> Days, DateOnly? NextBefore, int AllCount, int NoneCount, int HalfCount);

public static class GetReplayTracksEndpoint
{
    public const int DaysPerPage = 10;

    public static ProblemDetails Validate([FromQuery] string? filter, [FromQuery] string? before) =>
        ReplayFilters.IsKnown(filter) && (string.IsNullOrWhiteSpace(before) || TryParseDay(before, out _))
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyErrorCodes.InvalidReplayQuery, "Le filtre ou le jour de départ est mal écrit.");

    /// <summary>
    /// <c>GET /api/daily/replay?filter=all|none|half&amp;before=aaaa-mm-jj</c> : les morceaux que **le joueur de la requête** a ratés (rien trouvé, ou
    /// l'artiste ou le titre seulement), par jour, du plus récent au plus ancien, <see cref="DaysPerPage"/> jours par page. Seulement des jours
    /// **publiés** (jusqu'à la veille) et des parties qu'il ne peut plus jouer : rien du jour en cours, rien d'une partie de la veille encore en
    /// cours (pièges 31 et 18). Aucune adresse d'extrait : elle se demande à l'écoute (piège 14). 400 <c>daily.invalid_replay_query</c>, 401.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/daily/replay", OperationId = "getReplayTracks")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<ReplayResponse> Get(
        [FromQuery] string? filter, [FromQuery] string? before, ICurrentPlayer current, IDailyHistoryQueries queries, ITrackDirectory directory,
        IGameCalendar calendar, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var lastDay = ChallengeArchive.LastPublishedDay(calendar);
        DateOnly? from = TryParseDay(before, out var day) ? day : null;

        var (none, half) = await queries.CountMissedAnswersAsync(playerId, lastDay, ct);
        var missed = await queries.ListMissedAnswersAsync(playerId, lastDay, from, filter ?? ReplayFilters.All, DaysPerPage + 1, ct);
        var dates = missed.Select(m => m.Date).Distinct().OrderByDescending(d => d).ToList();
        var page = dates.Take(DaysPerPage).ToHashSet();
        var infos = await directory.GetAsync([.. missed.Where(m => page.Contains(m.Date)).Select(m => m.TrackId).Distinct()], ct);

        var days = missed.Where(m => page.Contains(m.Date))
            .GroupBy(m => m.Date)
            .OrderByDescending(g => g.Key)
            .Select(g => new ReplayDayResponse(g.Key, [.. g.OrderBy(m => m.Position)
                // Un morceau retiré du catalogue depuis n'a plus ni nom ni extrait : il est sauté, comme dans les réponses des jours passés.
                .Where(m => infos.ContainsKey(m.TrackId))
                .Select(m =>
                {
                    var info = infos[m.TrackId];
                    return new ReplayTrackResponse(m.Position, info.Artist, info.DisplayTitle, info.DeezerTrackId, info.CoverUrl, m.ArtistCorrect, m.TitleCorrect);
                })]))
            .Where(d => d.Tracks.Count > 0)
            .ToList();
        return new ReplayResponse(days, dates.Count > DaysPerPage ? dates[DaysPerPage - 1] : null, none + half, none, half);
    }

    private static bool TryParseDay(string? text, out DateOnly day) =>
        DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day);
}
