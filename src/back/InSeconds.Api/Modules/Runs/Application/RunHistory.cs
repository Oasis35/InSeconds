using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>Une partie finie du joueur (gagnée ou perdue) : de quoi remplir une ligne de l'historique, jamais un morceau.</summary>
/// <param name="EndedOn">Le jour (UTC) où elle s'est terminée.</param>
/// <param name="Difficulty">La plus haute difficulté choisie sur ses manches (« Sûre » quand elle n'a rien eu à choisir).</param>
public sealed record RunHistoryEntry(
    int SessionId, string ChallengeCode, RunSessionStatus Status, int RoundsPassed, int TotalScore, DateOnly EndedOn, RunDifficulty Difficulty);

/// <summary>Le résumé de toutes les parties finies du joueur : leur nombre, leur moyenne et la meilleure.</summary>
public sealed record RunHistorySummary(int Count, int? AverageScore, int? BestScore);

/// <summary>Lectures de l'historique d'un joueur sur le mode Run, en projections directes. Toujours **les parties de ce joueur**, jamais d'un autre.</summary>
public interface IRunHistoryQueries
{
    Task<RunHistorySummary> GetSummaryAsync(Guid playerId, CancellationToken ct);

    /// <summary>Les jours où le joueur a fini une partie (gagnée ou perdue), du plus récent au plus ancien.</summary>
    Task<IReadOnlyList<DateOnly>> ListEndedDaysAsync(Guid playerId, CancellationToken ct);

    /// <summary>Les parties finies entre ces deux instants (le second exclu), la plus récente d'abord.</summary>
    Task<IReadOnlyList<RunHistoryEntry>> ListAsync(Guid playerId, DateTimeOffset start, DateTimeOffset end, CancellationToken ct);
}

/// <summary>Une ligne de l'historique : une setlist jouée.</summary>
/// <param name="SessionId">Sa partie : le détail des morceaux se lit par <c>GET /api/runs/sessions/{id}</c>.</param>
/// <param name="Date">Le jour où elle s'est terminée.</param>
/// <param name="Status"><c>won</c> ou <c>lost</c>.</param>
/// <param name="Difficulty"><c>easy</c>, <c>safe</c> ou <c>risky</c> : la plus haute difficulté choisie sur ses manches.</param>
public sealed record RunHistoryRunResponse(
    int SessionId, string ChallengeCode, DateOnly Date, string Status, RunDiscResponse Disc, int RoundsPassed, int Score, string Difficulty);

/// <summary>L'historique du joueur sur le mode Run : le résumé de tout, puis un mois à la fois.</summary>
/// <param name="Month">Le mois lu (`aaaa-mm`).</param>
/// <param name="PreviousMonth">Le mois d'avant qui a une partie (vide : aucun), pour la flèche ‹.</param>
/// <param name="NextMonth">Le mois d'après qui a une partie (vide : aucun), pour la flèche ›.</param>
/// <param name="PlayedCount">Les parties finies du joueur, tous mois confondus.</param>
/// <param name="AverageScore">Leur score moyen, tous mois confondus ; vide sans partie.</param>
/// <param name="BestScore">Le record, tous mois confondus ; vide sans partie.</param>
/// <param name="Runs">Les parties du mois, la plus récente d'abord.</param>
public sealed record RunHistoryResponse(
    string Month, string? PreviousMonth, string? NextMonth, int PlayedCount, int? AverageScore, int? BestScore, IReadOnlyList<RunHistoryRunResponse> Runs);

public static class GetRunHistoryEndpoint
{
    public static ProblemDetails Validate([FromQuery] string? month) =>
        string.IsNullOrWhiteSpace(month) || GameMonth.TryParse(month, out _) ? WolverineContinue.NoProblems : RunsProblems.InvalidMonth();

    /// <summary>
    /// <c>GET /api/runs/history?month=aaaa-mm</c> : les setlists que **le joueur de la requête** a finies (gagnées ou perdues, pas les abandons), un
    /// mois à la fois (le mois en cours sans paramètre), avec le résumé de toutes ses parties. Lecture seule, jamais mise en cache ; l'identifiant ne
    /// vient que du cookie ; aucun morceau (le détail passe par la partie). 400 <c>runs.invalid_month</c>, 401 sans identité. Pas d'accès au mode
    /// demandé : ce sont ses propres parties.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/runs/history", OperationId = "getRunHistory")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static async Task<RunHistoryResponse> Get(
        [FromQuery] string? month, ICurrentPlayer current, IRunHistoryQueries queries, IGameCalendar calendar, RunsRules rules, CancellationToken ct)
    {
        var playerId = current.PlayerId!.Value;
        var first = GameMonth.TryParse(month, out var parsed) ? parsed : GameMonth.FirstDayOf(calendar.Today);
        var next = first.AddMonths(1);

        var summary = await queries.GetSummaryAsync(playerId, ct);
        var days = await queries.ListEndedDaysAsync(playerId, ct);
        var entries = await queries.ListAsync(playerId, calendar.StartOf(first), calendar.StartOf(next), ct);

        return new RunHistoryResponse(
            GameMonth.Of(first),
            days.Where(d => d < first).Select(GameMonth.Of).FirstOrDefault(),
            days.Where(d => d >= next).Select(GameMonth.Of).LastOrDefault(),
            summary.Count, summary.AverageScore, summary.BestScore,
            entries.Select(e =>
            {
                var disc = DiscLadder.Of(e.RoundsPassed, rules.Discs);
                return new RunHistoryRunResponse(
                    e.SessionId, e.ChallengeCode, e.EndedOn, RunViews.StatusOf(e.Status), new RunDiscResponse(disc.Key, disc.Stars), e.RoundsPassed, e.TotalScore,
                    RunDifficulties.KeyOf(e.Difficulty));
            }).ToList());
    }
}

/// <summary>L'extrait d'un morceau d'une partie finie.</summary>
/// <param name="PreviewUrl">Adresse signée et périssable (15 min, piège 14) ; vide si Deezer n'a pas d'extrait, ou n'a pas répondu.</param>
public sealed record RunPastPreviewResponse(string? PreviewUrl);

public static class GetRunPastPreviewEndpoint
{
    /// <summary>
    /// Le morceau joué à cette position d'une partie **du joueur de la requête, finie** : jamais un morceau pas encore joué, ni un morceau neutralisé
    /// (piège 31). Vide pour toute autre demande, la partie d'un autre joueur comprise.
    /// </summary>
    public static async Task<TrackInfo?> LoadAsync(
        int id, int position, ICurrentPlayer current, IRunsStore store, ITrackDirectory directory, CancellationToken ct)
    {
        if (current.PlayerId is not { } playerId || await store.ReadSessionAsync(id, playerId, ct) is not { IsPending: false } session)
            return null;
        if (!session.Answers.Any(a => a.Position == position && !a.Neutralized))
            return null;
        if (await store.FindChallengeAsync(session.ChallengeId, ct) is not { } challenge)
            return null;
        var trackId = session.TrackIdAt(challenge, position);
        return (await directory.GetAsync([trackId], ct)).GetValueOrDefault(trackId);
    }

    public static ProblemDetails Validate(TrackInfo? track) => track is null ? RunsProblems.TrackNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/runs/sessions/{id}/tracks/{position}/preview</c> : l'extrait d'un morceau déjà joué d'une partie finie, pour le réécouter depuis
    /// l'historique. Une adresse neuve à chaque appel (elle expire en 15 min), jamais mise en cache, sans rien écrire. 404 <c>runs.track_not_found</c>
    /// (partie inconnue, d'un autre joueur, en cours ; morceau pas joué ou neutralisé), 401 sans identité, 429 au-delà de 40 appels en 5 minutes.
    /// </summary>
    [Authorize]
    [WolverineGet("/api/runs/sessions/{id}/tracks/{position}/preview", OperationId = "getRunPastPreview")]
    [EnableRateLimiting(RateLimitPolicies.RunHistoryPreview)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public static async Task<RunPastPreviewResponse> Get([NotBody] TrackInfo track, ITrackPreviews previews, CancellationToken ct) =>
        new((await previews.GetUrlsAsync([track], ct)).GetValueOrDefault(track.Id));
}
