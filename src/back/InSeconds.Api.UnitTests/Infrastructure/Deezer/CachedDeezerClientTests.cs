using System.Net;
using System.Text;
using FluentAssertions;
using InSeconds.Api.Infrastructure.Deezer;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace InSeconds.Api.UnitTests.Infrastructure.Deezer;

public sealed class CachedDeezerClientTests
{
    private static (CachedDeezerClient Client, CountingHandler Handler) Create(Func<HttpResponseMessage> responseFactory)
    {
        var handler = new CountingHandler(responseFactory);
        var inner = new DeezerClient(
            new HttpClient(handler) { BaseAddress = new Uri("https://api.deezer.com") },
            NullLogger<DeezerClient>.Instance);
        return (new CachedDeezerClient(inner, new MemoryCache(new MemoryCacheOptions())), handler);
    }

    private static HttpResponseMessage Json(string body)
        => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task GetPreviewUrlAsync_hits_deezer_only_once_for_same_track()
    {
        var (client, handler) = Create(() => Json("""{"preview":"https://fake-preview.mp3"}"""));

        var first = await client.GetPreviewUrlAsync(123);
        var second = await client.GetPreviewUrlAsync(123);

        first.Should().Be("https://fake-preview.mp3");
        second.Should().Be("https://fake-preview.mp3");
        handler.CallCount.Should().Be(1);
    }

    [Fact]
    public async Task GetPreviewUrlAsync_does_not_cache_missing_preview()
    {
        var (client, handler) = Create(() => Json("""{"preview":""}"""));

        var first = await client.GetPreviewUrlAsync(123);
        var second = await client.GetPreviewUrlAsync(123);

        first.Should().BeEmpty();
        second.Should().BeEmpty();
        handler.CallCount.Should().Be(2, "une preview absente ne doit pas être mise en cache");
    }

    [Fact]
    public async Task GetPreviewUrlAsync_does_not_cache_http_error()
    {
        var (client, handler) = Create(() => new HttpResponseMessage(HttpStatusCode.InternalServerError));

        (await client.GetPreviewUrlAsync(123)).Should().BeNull();
        (await client.GetPreviewUrlAsync(123)).Should().BeNull();

        handler.CallCount.Should().Be(2, "un échec Deezer ne doit pas être mis en cache");
    }

    [Fact]
    public async Task GetPreviewUrlAsync_caches_per_track_id()
    {
        var (client, handler) = Create(() => Json("""{"preview":"https://fake-preview.mp3"}"""));

        await client.GetPreviewUrlAsync(1);
        await client.GetPreviewUrlAsync(2);

        handler.CallCount.Should().Be(2);
    }

    [Fact]
    public async Task SearchTracksAsync_hits_deezer_only_once_for_same_query()
    {
        var (client, handler) = Create(() => Json(
            """{"data":[{"id":1,"title":"One More Time","preview":"https://p.mp3","artist":{"name":"Daft Punk"}}]}"""));

        var first = await client.SearchTracksAsync("daft punk");
        var second = await client.SearchTracksAsync("daft punk");

        first.Should().ContainSingle(t => t.Artist == "Daft Punk");
        second.Should().BeSameAs(first);
        handler.CallCount.Should().Be(1);
    }

    [Fact]
    public async Task SearchTracksAsync_normalizes_query_for_cache_key()
    {
        var (client, handler) = Create(() => Json(
            """{"data":[{"id":1,"title":"One More Time","preview":"https://p.mp3","artist":{"name":"Daft Punk"}}]}"""));

        await client.SearchTracksAsync("Daft Punk");
        await client.SearchTracksAsync("  daft punk ");

        handler.CallCount.Should().Be(1);
    }

    [Fact]
    public async Task SearchTracksAsync_does_not_cache_empty_results()
    {
        var (client, handler) = Create(() => Json("""{"data":[]}"""));

        (await client.SearchTracksAsync("zzz")).Should().BeEmpty();
        (await client.SearchTracksAsync("zzz")).Should().BeEmpty();

        handler.CallCount.Should().Be(2, "un résultat vide (potentiel échec réseau) ne doit pas être mis en cache");
    }

    private sealed class CountingHandler(Func<HttpResponseMessage> responseFactory) : HttpMessageHandler
    {
        public int CallCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            CallCount++;
            return Task.FromResult(responseFactory());
        }
    }
}
