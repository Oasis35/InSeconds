using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Le cooldown en vigueur : la part du pool réglée, les morceaux jouables, et les jours qui s'en déduisent.</summary>
/// <param name="PoolPercent">La part du pool en cooldown (<c>Daily:TrackCooldownPoolPercent</c>).</param>
/// <param name="PlayableCount">Les morceaux jouables : non désactivés, extrait disponible.</param>
/// <param name="Days">Les jours de cooldown (<see cref="TrackCooldown.Days"/>).</param>
public sealed record TrackCooldownState(int PoolPercent, int PlayableCount, int Days);

/// <summary>
/// Calcule le cooldown des morceaux **à chaque appel** (#275) : il suit la taille du pool (un ajout ou une désactivation compte dès le
/// tirage suivant) et les réglages relus à chaud (<c>Daily:TrackCooldownPoolPercent</c>, <c>Daily:TracksPerChallenge</c>). Le tirage, la
/// date de déblocage du pool admin et le contrôle nocturne des extraits passent tous par lui (<c>EfTrackUsage</c>).
/// </summary>
public sealed class TrackCooldownPolicy(ITrackDirectory tracks, IOptionsMonitor<DailyOptions> options)
{
    public Task<TrackCooldownState> CurrentAsync(CancellationToken ct) =>
        WithPoolPercentAsync(options.CurrentValue.EffectiveTrackCooldownPoolPercent, ct);

    /// <summary>Le cooldown qu'une autre part du pool donnerait (celle que l'admin vient d'enregistrer).</summary>
    public async Task<TrackCooldownState> WithPoolPercentAsync(int poolPercent, CancellationToken ct)
    {
        var playable = (await tracks.ListPlayableIdsAsync(ct)).Count;
        var days = TrackCooldown.Days(playable, poolPercent, options.CurrentValue.EffectiveTracksPerChallenge);
        return new TrackCooldownState(poolPercent, playable, days);
    }
}
