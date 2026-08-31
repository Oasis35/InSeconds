using System.Net;
using System.Text.Json;
using FluentAssertions;
using InSeconds.Api.Common.Email;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Email;

public sealed class ResendEmailSenderTests
{
    private static ResendEmailSender Create(HttpMessageHandler handler, ResendOptions? options = null)
        => new(
            new HttpClient(handler) { BaseAddress = new Uri("https://api.resend.com/") },
            Options.Create(options ?? new ResendOptions { SenderEmail = "noreply@inseconds.cc", SenderName = "IN//SECONDS", ApiKey = "re_test" }),
            NullLogger<ResendEmailSender>.Instance);

    [Fact]
    public async Task SendAsync_posts_to_emails_endpoint_with_expected_payload()
    {
        var handler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK));
        var sender = Create(handler);

        await sender.SendAsync("player@example.com", "Sujet du test", "<p>Corps</p>");

        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.Method.Should().Be(HttpMethod.Post);
        handler.LastRequest.RequestUri.Should().Be("https://api.resend.com/emails");

        using var body = JsonDocument.Parse(handler.LastBody!);
        var root = body.RootElement;
        root.GetProperty("from").GetString().Should().Be("IN//SECONDS <noreply@inseconds.cc>");
        root.GetProperty("to").EnumerateArray().Select(e => e.GetString()).Should().ContainSingle().Which.Should().Be("player@example.com");
        root.GetProperty("subject").GetString().Should().Be("Sujet du test");
        root.GetProperty("html").GetString().Should().Be("<p>Corps</p>");
    }

    [Fact]
    public async Task SendAsync_does_not_throw_on_success()
    {
        var sender = Create(new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK)));

        var act = () => sender.SendAsync("player@example.com", "Sujet", "<p>Corps</p>");

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task SendAsync_throws_on_http_error()
    {
        var response = new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("""{"message":"Invalid API key"}""")
        };
        var sender = Create(new CapturingHandler(response));

        var act = () => sender.SendAsync("player@example.com", "Sujet", "<p>Corps</p>");

        var ex = await act.Should().ThrowAsync<HttpRequestException>();
        ex.Which.Message.Should().Contain("401");
        ex.Which.Message.Should().Contain("Invalid API key");
    }

    [Fact]
    public async Task SendAsync_propagates_cancellation_without_wrapping()
    {
        var sender = Create(new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK)));
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var act = () => sender.SendAsync("player@example.com", "Sujet", "<p>Corps</p>", cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    // Capture la requête envoyée (méthode/URL/corps) pour l'asserter, renvoie la réponse configurée.
    private sealed class CapturingHandler(HttpResponseMessage response) : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            LastRequest = request;
            LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
            return response;
        }
    }
}
