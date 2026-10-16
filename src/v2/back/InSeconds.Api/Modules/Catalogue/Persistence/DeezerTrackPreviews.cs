using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Deezer;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

/// <summary>L'extrait vient de <see cref="IPreviewProvider"/> (client Deezer et son cache, dont la durée est bornée par la signature de l'adresse).</summary>
public sealed class DeezerTrackPreviews(IPreviewProvider previews) : ITrackPreviews
{
    public async Task<IReadOnlyDictionary<int, string>> GetUrlsAsync(IReadOnlyCollection<TrackInfo> tracks, CancellationToken ct)
    {
        var lookups = await Task.WhenAll(tracks.Select(async t => (t.Id, Lookup: await previews.GetPreviewAsync(t.DeezerTrackId, ct))));
        return lookups
            .Where(l => l.Lookup is PreviewLookup.Found)
            .ToDictionary(l => l.Id, l => ((PreviewLookup.Found)l.Lookup).Url);
    }
}
