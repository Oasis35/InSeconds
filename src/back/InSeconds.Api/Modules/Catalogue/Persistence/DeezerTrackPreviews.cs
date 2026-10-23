using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Deezer;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

/// <summary>
/// L'extrait vient de <see cref="IPreviewProvider"/>, sans cache : Deezer signe ses adresses pour 15 min (piège 14), chaque appel en
/// demande une fraîche.
/// </summary>
public sealed class DeezerTrackPreviews(IPreviewProvider previews) : ITrackPreviews
{
    public async Task<IReadOnlyDictionary<int, string>> GetUrlsAsync(IReadOnlyCollection<TrackInfo> tracks, CancellationToken ct)
    {
        var lookups = await Task.WhenAll(tracks.Select(async t => (t.Id, Lookup: await previews.GetPreviewAsync(t.DeezerTrackId, ct))));
        return lookups
            .Where(l => l.Lookup is PreviewLookup.Found)
            .ToDictionary(l => l.Id, l => ((PreviewLookup.Found)l.Lookup).Url);
    }

    public async Task<TrackPreview> GetAsync(TrackInfo track, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(track);
        return await previews.GetPreviewAsync(track.DeezerTrackId, ct) switch
        {
            PreviewLookup.Found found => TrackPreview.Available(found.Url),
            PreviewLookup.Missing => TrackPreview.Missing,
            _ => TrackPreview.Unavailable,
        };
    }
}
