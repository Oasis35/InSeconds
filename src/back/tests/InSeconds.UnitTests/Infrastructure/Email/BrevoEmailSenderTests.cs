using System.Net;
using System.Text.Json;
using InSeconds.Infrastructure.Email;
using InSeconds.UnitTests.Support;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace InSeconds.UnitTests.Infrastructure.Email;

public class BrevoEmailSenderTests
{
    private const string Recipient = "joueur@example.com";
    private readonly CapturingLogger<BrevoEmailSender> _logger = new();

    [Fact]
    public async Task Envoi_PosteLeMessageAttenduABrevo()
    {
        var handler = StubHttpHandler.Returning(HttpStatusCode.Created, """{"messageId":"<abc@brevo>"}""");

        await CreateSender(handler).SendAsync(Recipient, "Ton lien", "<p>Salut</p>", TestContext.Current.CancellationToken);

        Assert.Equal(HttpMethod.Post, handler.LastRequest!.Method);
        Assert.Equal(new Uri(BrevoEmailSender.BaseAddress + "smtp/email"), handler.LastRequest.RequestUri);
        var payload = JsonDocument.Parse(handler.LastBody!).RootElement;
        Assert.Equal("compte@inseconds.cc", payload.GetProperty("sender").GetProperty("email").GetString());
        Assert.Equal("IN//SECONDS", payload.GetProperty("sender").GetProperty("name").GetString());
        Assert.Equal(Recipient, payload.GetProperty("to")[0].GetProperty("email").GetString());
        Assert.Equal("Ton lien", payload.GetProperty("subject").GetString());
        Assert.Equal("<p>Salut</p>", payload.GetProperty("htmlContent").GetString());
    }

    [Fact]
    public async Task Envoi_LogueLeSujetEtLIdentifiantBrevo_JamaisLeDestinataire()
    {
        var handler = StubHttpHandler.Returning(HttpStatusCode.Created, """{"messageId":"<abc@brevo>"}""");

        await CreateSender(handler).SendAsync(Recipient, "Ton lien", "<p>Salut</p>", TestContext.Current.CancellationToken);

        var entry = Assert.Single(_logger.Entries);
        Assert.Equal(1007, entry.EventId.Id);
        Assert.Contains(entry.Properties, p => p.Key == "EmailMessageId" && Equals(p.Value, "<abc@brevo>"));
        AssertNoRecipient(entry);
    }

    [Fact]
    public async Task ErreurBrevo_LeveUneExceptionEtLogueSansLeDestinataire()
    {
        var handler = StubHttpHandler.Returning(HttpStatusCode.BadRequest,
            $$"""{"code":"invalid_parameter","message":"email {{Recipient}} is not valid"}""");

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            CreateSender(handler).SendAsync(Recipient, "Ton lien", "<p>Salut</p>", TestContext.Current.CancellationToken));

        Assert.Contains("invalid_parameter", exception.Message);
        Assert.DoesNotContain(Recipient, exception.Message);
        var entry = Assert.Single(_logger.Entries);
        Assert.Equal(1101, entry.EventId.Id);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Contains(entry.Properties, p => p.Key == "HttpStatus" && Equals(p.Value, 400));
        AssertNoRecipient(entry);
    }

    [Fact]
    public async Task PanneReseau_EstLogueeEtRemonte()
    {
        var handler = new StubHttpHandler((_, _) => throw new HttpRequestException("connexion refusée"));

        await Assert.ThrowsAsync<HttpRequestException>(() =>
            CreateSender(handler).SendAsync(Recipient, "Ton lien", "<p>Salut</p>", TestContext.Current.CancellationToken));

        var entry = Assert.Single(_logger.Entries);
        Assert.Equal(1101, entry.EventId.Id);
        Assert.NotNull(entry.Exception);
    }

    [Fact]
    public async Task Annulation_RemonteSansLog()
    {
        var handler = new StubHttpHandler((_, ct) => Task.FromCanceled<HttpResponseMessage>(ct));
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CreateSender(handler).SendAsync(Recipient, "Ton lien", "<p>Salut</p>", cts.Token));

        Assert.Empty(_logger.Entries);
    }

    private BrevoEmailSender CreateSender(StubHttpHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri(BrevoEmailSender.BaseAddress) },
            Options.Create(new BrevoOptions { ApiKey = "clé", SenderEmail = "compte@inseconds.cc" }),
            _logger);

    private static void AssertNoRecipient(CapturedLog entry)
    {
        Assert.DoesNotContain(Recipient, entry.Message);
        Assert.DoesNotContain(entry.Properties, p => p.Value?.ToString()?.Contains(Recipient) == true);
    }
}
