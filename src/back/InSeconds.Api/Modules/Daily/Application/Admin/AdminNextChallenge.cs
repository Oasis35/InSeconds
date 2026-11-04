using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.Extensions.Options;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Ce que le tirage du défi de demain trouverait, s'il avait lieu maintenant.</summary>
/// <param name="Date">Demain (jour UTC).</param>
/// <param name="EligibleCount">Morceaux jouables hors cooldown pour ce jour-là : ceux que le tirage peut prendre.</param>
/// <param name="RequiredCount">Morceaux qu'un défi demande (<see cref="DailyOptions.EffectiveTracksPerChallenge"/>).</param>
/// <param name="Generated">Le défi de demain existe déjà.</param>
public sealed record NextChallengeResponse(DateOnly Date, int EligibleCount, int RequiredCount, bool Generated);

public static class GetNextChallengeEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/daily/next-challenge</c> : le défi de demain pourra-t-il être tiré ? Même calcul que la génération
    /// (<see cref="GenerateDailyChallengeHandler"/>), sans rien écrire. Prêt dès que <c>EligibleCount</c> atteint <c>RequiredCount</c>.
    /// </summary>
    [WolverineGet("/api/admin/daily/next-challenge", OperationId = "getNextChallenge")]
    public static async Task<NextChallengeResponse> Get(
        ITrackDirectory tracks, IDailyTrackUsage usage, ITrackSelector selector, IDailyStatsQueries stats, IOptionsMonitor<DailyOptions> options, IGameCalendar calendar,
        CancellationToken ct)
    {
        var day = calendar.Today.AddDays(1);
        var playable = await tracks.ListPlayableIdsAsync(ct);
        var inCooldown = await usage.GetTracksInCooldownAsync(day, ct);
        var required = options.CurrentValue.EffectiveTracksPerChallenge;
        // Le sélecteur de la génération compte lui-même les morceaux tirables : les deux ne peuvent pas diverger.
        var eligible = selector.Select(playable, inCooldown, required, DailyChallenge.SeedOf(day)).EligibleCount;
        var generated = await stats.FindChallengeIdAsync(day, ct) is not null;
        return new NextChallengeResponse(day, eligible, required, generated);
    }
}
