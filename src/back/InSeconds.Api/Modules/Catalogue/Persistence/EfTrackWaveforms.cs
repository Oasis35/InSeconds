using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Waveform;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

/// <summary>
/// La forme lue en base (projection : le reste du morceau n'est pas chargé). Un blob d'une autre version que la courante n'est pas envoyé
/// (le navigateur ne saurait pas le lire) : le morceau est alors traité comme sans forme, jusqu'à son recalcul de nuit.
/// </summary>
public sealed class EfTrackWaveforms(InSecondsDbContext db, ILogger<EfTrackWaveforms> logger) : ITrackWaveforms
{
    public async Task<IReadOnlyDictionary<int, byte[]>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var ids = trackIds.ToArray();
        var rows = await db.Set<Track>().AsNoTracking()
            .Where(t => ids.Contains(t.Id) && t.Waveform != null)
            .Select(t => new { t.Id, t.Waveform })
            .ToListAsync(ct);

        var found = rows
            .Where(r => WaveformFormat.IsCurrent(r.Waveform))
            .ToDictionary(r => r.Id, r => r.Waveform!);

        // Un morceau envoyé sans forme : le navigateur la calcule lui-même (et le dit, WaveformFallback). Ajout récent, échec du calcul ou
        // premier remplissage pas encore fait : l'identifiant suffit à le retrouver (jamais côté joueur, piège 31).
        foreach (var id in ids.Where(id => !found.ContainsKey(id)))
            CatalogueLog.TrackWithoutWaveform(logger, id);
        return found;
    }
}
