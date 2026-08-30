using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests.Admin;

[Collection("Integration")]
public class SendTestEmailTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task SendTestEmail_Succes_Returns200()
    {
        var resp = await AdminPostAsync("/api/admin/send-test-email", new { ToEmail = "diagnostic@example.com" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task SendTestEmail_FormatInvalide_Returns400()
    {
        var resp = await AdminPostAsync("/api/admin/send-test-email", new { ToEmail = "pas-un-email" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task SendTestEmail_SansAuthAdmin_Returns401()
    {
        var resp = await _client.PostAsJsonAsync("/api/admin/send-test-email", new { ToEmail = "diagnostic@example.com" });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task SendTestEmail_NeCreeAucuneEntreeEnBase()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var playersBefore = await db.Players.CountAsync();
        var allowedBefore = await db.AllowedEmails.CountAsync();
        var tokensBefore = await db.MagicLinkTokens.CountAsync();

        await AdminPostAsync("/api/admin/send-test-email", new { ToEmail = "diagnostic-sans-effet@example.com" });

        Assert.Equal(playersBefore, await db.Players.CountAsync());
        Assert.Equal(allowedBefore, await db.AllowedEmails.CountAsync());
        Assert.Equal(tokensBefore, await db.MagicLinkTokens.CountAsync());
    }

    // ── helper ───────────────────────────────────────────────────────────────

    private Task<HttpResponseMessage> AdminPostAsync(string url, object body)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }
}
