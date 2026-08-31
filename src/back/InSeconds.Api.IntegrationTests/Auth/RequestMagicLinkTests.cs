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
    public async Task RequestMagicLink_EmailWhitelisted_Returns200EtCreeUnToken()
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "allowed@e2e.test" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var token = await db.MagicLinkTokens.SingleAsync(m => m.Email == "allowed@e2e.test");

        var expectedExpiry = DateTime.UtcNow.AddMinutes(15);
        Assert.True(Math.Abs((token.ExpiresAt - expectedExpiry).TotalMinutes) < 2);
    }

    [Fact]
    public async Task RequestMagicLink_EmailNonWhitelisted_Returns200SansCreerDeToken()
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "inconnu@example.com" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await db.MagicLinkTokens.AnyAsync(m => m.Email == "inconnu@example.com"));
    }

    [Fact]
    public async Task RequestMagicLink_DemandeRepetee_MoinsDe60s_NeRecreePasDeToken()
    {
        await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "allowed@e2e.test" });
        await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "allowed@e2e.test" });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var count = await db.MagicLinkTokens.CountAsync(m => m.Email == "allowed@e2e.test");

        Assert.Equal(1, count);
    }

    [Fact]
    public async Task RequestMagicLink_EmailInvalide_Returns400()
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "pas-un-email" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
