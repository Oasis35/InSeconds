using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Persistence;
using InSeconds.Deezer;

namespace InSeconds.UnitTests.Catalogue;

public class DeezerTrackPreviewsTests
{
    [Fact]
    public async Task GetUrls_never_runs_more_lookups_at_once_than_the_cap()
    {
        var provider = new CountingProvider();
        var tracks = Enumerable.Range(1, 12).Select(i => Track(i)).ToList();

        var urls = await new DeezerTrackPreviews(provider).GetUrlsAsync(tracks, CancellationToken.None);

        Assert.Equal(12, urls.Count);
        Assert.Equal(DeezerTrackPreviews.MaxParallelLookups, provider.MaxInFlight);
    }

    [Fact]
    public async Task GetUrls_keeps_only_found_previews()
    {
        var provider = new CountingProvider(missingIds: [2]);

        var urls = await new DeezerTrackPreviews(provider).GetUrlsAsync([Track(1), Track(2), Track(3)], CancellationToken.None);

        Assert.Equal([1, 3], urls.Keys.Order());
    }

    private static TrackInfo Track(int id) => new(id, id, "A", "T", "T", null, null, null, []);

    private sealed class CountingProvider(int[]? missingIds = null) : IPreviewProvider
    {
        private int _inFlight;

        public int MaxInFlight { get; private set; }

        public async Task<PreviewLookup> GetPreviewAsync(long deezerTrackId, CancellationToken ct = default)
        {
            var now = Interlocked.Increment(ref _inFlight);
            lock (this)
            {
                MaxInFlight = Math.Max(MaxInFlight, now);
            }

            await Task.Delay(30, ct);
            Interlocked.Decrement(ref _inFlight);
            return missingIds?.Contains((int)deezerTrackId) == true ? new PreviewLookup.Missing() : new PreviewLookup.Found($"u{deezerTrackId}");
        }
    }
}
