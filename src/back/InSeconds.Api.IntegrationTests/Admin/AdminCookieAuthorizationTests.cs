using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using InSeconds.Api.Common.Email;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests.Admin;

// Couvre la nouvelle autorisation admin par cookie joueur (Player.IsAdmin), qui remplace
// l'ancien mot de passe + Bearer token. Le bypass Testing ("Bearer admin-token", cf.
// PlayerAuthMiddleware) ne teste pas ce chemin — ces tests utilisent un vrai cookie
// authToken posé par un vrai login magic-link, sur des HttpClient isolés (jamais le
// factory.Client partagé) pour ne pas laisser fuiter un cookie entre tests.
[Collection("Integration")]
public class AdminCookieAuthorizationTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private const string TestEmail = "admin-cookie-test@example.com";

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task JoueurLieEtAdmin_AccedeADashboardAdmin_SansBearer()
    {
        var client = factory.CreateClient();
        await LinkPlayerAsync(client, TestEmail, "AdminCookieTest");
        await SetIsAdminAsync(TestEmail, true);

        var me = await client.GetAsync("/api/admin/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);

        // L'autorisation vaut aussi pour un endpoint admin réel, pas seulement /me.
        var tracks = await client.GetAsync("/api/admin/tracks");
        Assert.Equal(HttpStatusCode.OK, tracks.StatusCode);
    }

    [Fact]
    public async Task JoueurLieMaisPasAdmin_Retourne401()
    {
        var client = factory.CreateClient();
        await LinkPlayerAsync(client, TestEmail, "PasAdmin");

        var resp = await client.GetAsync("/api/admin/me");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Guest_Retourne401()
    {
        var client = factory.CreateClient();

        var resp = await client.GetAsync("/api/admin/me");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async Task LinkPlayerAsync(HttpClient client, string email, string pseudo)
    {
        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");

        await client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = email });

        var capture = factory.Services.GetRequiredService<TestEmailCapture>();
        Assert.True(capture.TryGetLast(email, out var lastEmail));

        var match = Regex.Match(lastEmail.Html, "href=\"([^\"]+)\"");
        Assert.True(match.Success);
        var tokenMatch = Regex.Match(match.Groups[1].Value, "token=([^&]+)");
        Assert.True(tokenMatch.Success);

        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify",
            new { Token = tokenMatch.Groups[1].Value, Pseudo = pseudo });
        resp.EnsureSuccessStatusCode();
    }

    private async Task SetIsAdminAsync(string email, bool isAdmin)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player = await db.Players.SingleAsync(p => p.Email == email);
        player.IsAdmin = isAdmin;
        await db.SaveChangesAsync();
    }
}
