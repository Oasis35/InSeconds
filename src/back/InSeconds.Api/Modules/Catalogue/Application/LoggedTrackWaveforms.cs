using InSeconds.Api.Modules.Catalogue.Contracts;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>
/// Le port <see cref="ITrackWaveforms"/> des modes : lit la forme en base et signale chaque morceau qui part sans forme. Le navigateur la calcule
/// alors lui-même (et le dit, WaveformFallback) : ajout récent, calcul en échec ou premier remplissage pas encore fait. L'identifiant en base
/// suffit à retrouver le morceau (jamais côté joueur, piège 31).
/// </summary>
public sealed class LoggedTrackWaveforms(Persistence.EfTrackWaveforms inner, ILogger<LoggedTrackWaveforms> logger) : ITrackWaveforms
{
    public async Task<IReadOnlyDictionary<int, byte[]>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var found = await inner.GetAsync(trackIds, ct);
        foreach (var id in trackIds.Where(id => !found.ContainsKey(id)))
            CatalogueLog.TrackWithoutWaveform(logger, id);
        return found;
    }
}
