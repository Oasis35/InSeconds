using System.Net;
using System.Text;
using FluentAssertions;
using InSeconds.Api.Infrastructure.Deezer;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace InSeconds.Api.UnitTests.Infrastructure.Deezer;

public sealed class DeezerClientTests
{
    private static DeezerClient Create(HttpMessageHandler handler)
        => new(new HttpClient(handler) { BaseAddress = new Uri("https://api.deezer.com") }, NullLogger<DeezerClient>.Instance);

    private static HttpResponseMessage Json(string body)
        => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task GetPreviewUrlAsync_returns_preview_on_success()
    {
        var client = Create(new StubHandler(Json("""{"preview":"https://fake-preview.mp3"}""")));

        var preview = await client.GetPreviewUrlAsync(123);

        preview.Should().Be("https://fake-preview.mp3");
    }

    [Fact]
    public async Task GetPreviewUrlAsync_returns_null_on_http_error()
    {
        var client = Create(new StubHandler(new HttpResponseMessage(HttpStatusCode.NotFound)));

        var preview = await client.GetPreviewUrlAsync(123);

        preview.Should().BeNull();
    }

    [Fact]
    public async Task SearchTracksAsync_returns_empty_on_http_error()
    {
        var client = Create(new StubHandler(new HttpResponseMessage(HttpStatusCode.InternalServerError)));

        var results = await client.SearchTracksAsync("daft punk");

        results.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTrackInfoAsync_returns_null_on_http_error()
    {
        var client = Create(new StubHandler(new HttpResponseMessage(HttpStatusCode.NotFound)));

        var info = await client.GetTrackInfoAsync(123);

        info.Should().BeNull();
    }

    [Fact]
    public async Task GetPreviewUrlAsync_returns_null_on_deezer_error_payload()
    {
        // Deezer renvoie ses erreurs (quota…) en HTTP 200 avec un payload "error".
        var client = Create(new StubHandler(Json("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""")));

        var preview = await client.GetPreviewUrlAsync(123);

        preview.Should().BeNull();
    }

    [Fact]
    public async Task ProbePreviewAsync_fails_on_deezer_error_payload()
    {
        var client = Create(new StubHandler(Json("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""")));

        var probe = await client.ProbePreviewAsync(123);

        probe.Succeeded.Should().BeFalse();
        probe.PreviewUrl.Should().BeNull();
    }

    [Fact]
    public async Task ProbePreviewAsync_succeeds_with_empty_preview_on_deezer_no_data_error()
    {
        // Code 800 "no data" = le track n'existe plus sur Deezer : réponse déterminée, pas un échec.
        var client = Create(new StubHandler(Json("""{"error":{"type":"DataException","message":"no data","code":800}}""")));

        var probe = await client.ProbePreviewAsync(123);

        probe.Succeeded.Should().BeTrue();
        probe.PreviewUrl.Should().BeEmpty();
    }

    [Fact]
    public async Task ProbePreviewAsync_fails_on_http_error()
    {
        var client = Create(new StubHandler(new HttpResponseMessage(HttpStatusCode.InternalServerError)));

        var probe = await client.ProbePreviewAsync(123);

        probe.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task ProbePreviewAsync_succeeds_with_empty_preview_when_track_really_has_none()
    {
        var client = Create(new StubHandler(Json("""{"id":123,"title":"T","preview":"","artist":{"name":"A"}}""")));

        var probe = await client.ProbePreviewAsync(123);

        probe.Succeeded.Should().BeTrue();
        probe.PreviewUrl.Should().BeEmpty();
    }

    [Fact]
    public async Task ProbePreviewAsync_succeeds_with_preview()
    {
        var client = Create(new StubHandler(Json("""{"preview":"https://fake-preview.mp3"}""")));

        var probe = await client.ProbePreviewAsync(123);

        probe.Succeeded.Should().BeTrue();
        probe.PreviewUrl.Should().Be("https://fake-preview.mp3");
    }

    [Fact]
    public async Task ProbePreviewAsync_propagates_cancellation()
    {
        var client = Create(new StubHandler(Json("""{"preview":"https://fake-preview.mp3"}""")));
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var act = () => client.ProbePreviewAsync(123, cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task GetTrackInfoAsync_returns_null_on_deezer_error_payload()
    {
        var client = Create(new StubHandler(Json("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""")));

        var info = await client.GetTrackInfoAsync(123);

        info.Should().BeNull();
    }

    [Fact]
    public async Task SearchTracksAsync_returns_empty_on_deezer_error_payload()
    {
        var client = Create(new StubHandler(Json("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""")));

        var results = await client.SearchTracksAsync("daft punk");

        results.Should().BeEmpty();
    }

    [Fact]
    public async Task GetPreviewUrlAsync_propagates_cancellation()
    {
        var client = Create(new StubHandler(Json("""{"preview":"https://fake-preview.mp3"}""")));
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var act = () => client.GetPreviewUrlAsync(123, cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task SearchTracksAsync_propagates_cancellation()
    {
        var client = Create(new StubHandler(Json("""{"data":[]}""")));
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var act = () => client.SearchTracksAsync("daft punk", cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    // Honore l'annulation avant d'émettre la requête, sinon renvoie la réponse stub.
    private sealed class StubHandler(HttpResponseMessage response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult(response);
        }
    }
}
