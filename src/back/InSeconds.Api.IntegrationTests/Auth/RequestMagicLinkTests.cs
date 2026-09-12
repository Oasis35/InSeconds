using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests.Auth;

[Collection("Integration")]
public class RequestMagicLinkTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task RequestMagicLink_NimporteQuelEmail_Returns200EtCreeUnToken()
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "nouveau@example.com" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var token = await db.MagicLinkTokens.SingleAsync(m => m.Email == "nouveau@example.com");

        var expectedExpiry = DateTime.UtcNow.AddMinutes(15);
        Assert.True(Math.Abs((token.ExpiresAt - expectedExpiry).TotalMinutes) < 2);
    }

    [Fact]
    public async Task RequestMagicLink_DemandeRepetee_MoinsDe60s_NeRecreePasDeToken()
    {
        await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "nouveau@example.com" });
        await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "nouveau@example.com" });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var count = await db.MagicLinkTokens.CountAsync(m => m.Email == "nouveau@example.com");

        Assert.Equal(1, count);
    }

    [Fact]
    public async Task RequestMagicLink_EmailInvalide_Returns400()
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "pas-un-email" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
