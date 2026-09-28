using System.Net;
using System.Text.Json;
using FluentAssertions;
using InSeconds.Api.Common.Email;
using InSeconds.Api.UnitTests.Common.Observability;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Email;

public sealed class BrevoEmailSenderTests
{
    private static BrevoEmailSender Create(HttpMessageHandler handler, BrevoOptions? options = null, ILogger<BrevoEmailSender>? logger = null)
        => new(
            new HttpClient(handler) { BaseAddress = new Uri("https://api.brevo.com/v3/") },
            Options.Create(options ?? new BrevoOptions { SenderEmail = "compte@inseconds.cc", SenderName = "IN//SECONDS", ApiKey = "xkeysib-test" }),
            logger ?? NullLogger<BrevoEmailSender>.Instance);

    [Fact]
    public async Task SendAsync_posts_to_emails_endpoint_with_expected_payload()
    {
        var handler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.Created));
        var sender = Create(handler);

        await sender.SendAsync("player@example.com", "Sujet du test", "<p>Corps</p>");

        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.Method.Should().Be(HttpMethod.Post);
        handler.LastRequest.RequestUri.Should().Be("https://api.brevo.com/v3/smtp/email");

        using var body = JsonDocument.Parse(handler.LastBody!);
        var root = body.RootElement;
        root.GetProperty("sender").GetProperty("name").GetString().Should().Be("IN//SECONDS");
        root.GetProperty("sender").GetProperty("email").GetString().Should().Be("compte@inseconds.cc");
        root.GetProperty("to").EnumerateArray().Select(e => e.GetProperty("email").GetString()).Should().ContainSingle().Which.Should().Be("player@example.com");
        root.GetProperty("subject").GetString().Should().Be("Sujet du test");
        root.GetProperty("htmlContent").GetString().Should().Be("<p>Corps</p>");
    }

    [Fact]
    public async Task SendAsync_does_not_throw_on_success()
    {
        var sender = Create(new CapturingHandler(new HttpResponseMessage(HttpStatusCode.Created)));

        var act = () => sender.SendAsync("player@example.com", "Sujet", "<p>Corps</p>");

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task SendAsync_throws_on_http_error()
    {
        var response = new HttpResponseMessage(HttpStatusCode.BadRequest)
        {
            Content = new StringContent("""{"code":"invalid_parameter","message":"email is not valid in to: player@example.com"}""", System.Text.Encoding.UTF8, "application/json")
        };
        var logger = new CapturingLogger<BrevoEmailSender>();
        var sender = Create(new CapturingHandler(response), logger: logger);

        var act = () => sender.SendAsync("player@example.com", "Sujet", "<p>Corps</p>");

        var ex = await act.Should().ThrowAsync<HttpRequestException>();
        ex.Which.Message.Should().Contain("400");
        ex.Which.Message.Should().Contain("invalid_parameter");
        // Confidentialité : l'adresse du destinataire n'atteint ni l'exception ni les logs.
        ex.Which.Message.Should().NotContain("player@example.com");
        logger.Messages.Should().ContainSingle(m => m.Contains("Échec") && m.Contains("Sujet") && m.Contains("400"));
        logger.Messages.Should().NotContain(m => m.Contains("player@example.com"));
    }

    [Fact]
    public async Task SendAsync_logs_the_brevo_message_id_without_the_recipient()
    {
        var response = new HttpResponseMessage(HttpStatusCode.Created)
        {
            Content = new StringContent("""{"messageId":"<202609281830.12345678901@smtp-relay.mailin.fr>"}""", System.Text.Encoding.UTF8, "application/json")
        };
        var logger = new CapturingLogger<BrevoEmailSender>();
        var sender = Create(new CapturingHandler(response), logger: logger);

        await sender.SendAsync("player@example.com", "Sujet", "<p>Corps</p>");

        logger.Messages.Should().ContainSingle(m => m.Contains("Sujet") && m.Contains("202609281830.12345678901@smtp-relay.mailin.fr"));
        logger.Messages.Should().NotContain(m => m.Contains("player@example.com"));
    }

    [Fact]
    public async Task SendAsync_propagates_cancellation_without_wrapping()
    {
        var sender = Create(new CapturingHandler(new HttpResponseMessage(HttpStatusCode.Created)));
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
