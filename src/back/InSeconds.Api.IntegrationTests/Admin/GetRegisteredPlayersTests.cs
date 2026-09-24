using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using InSeconds.Api.Common.Email;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Players.GetPlayerHistory;
using InSeconds.Api.Features.Admin.Players.GetRegisteredPlayers;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests.Admin;

// GET /api/admin/players : liste des comptes inscrits (pseudo, email, dernière visite).
// Même approche que AdminCookieAuthorizationTests : vrais logins magic-link sur des
// HttpClient isolés, admin promu en base.
[Collection("Integration")]
public class GetRegisteredPlayersTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private const string AdminEmail = "players-admin@example.com";
    private const string MemberEmail = "players-member@example.com";

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Admin_ListeLesComptesInscrits_SansLesInvites()
    {
        var admin = factory.CreateClient();
        await LinkPlayerAsync(admin, AdminEmail, "ChefAdmin");
        await SetIsAdminAsync(AdminEmail);

        var member = factory.CreateClient();
        await LinkPlayerAsync(member, MemberEmail, "Membre");
        // Une requête authentifiée par le cookie du membre pose sa dernière visite.
        (await member.GetAsync("/api/players/me?peek=true")).EnsureSuccessStatusCode();

        // Un invité (Player créé sans compte) ne doit pas apparaître.
        var guest = factory.CreateClient();
        (await guest.GetAsync("/api/players/me")).EnsureSuccessStatusCode();

        var resp = await admin.GetAsync("/api/admin/players");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadFromJsonAsync<RegisteredPlayersResponse>();
        Assert.NotNull(body);
        Assert.Equal(2, body.Players.Count);

        var m = Assert.Single(body.Players, p => p.Email == MemberEmail);
        Assert.Equal("Membre", m.Pseudo);
        Assert.False(m.IsAdmin);
        Assert.Equal(0, m.GamesPlayed);
        Assert.NotNull(m.LastSeenAt);
        // Nouveau compte : série à 0, gel offert à l'inscription.
        Assert.Equal(0, m.CurrentStreak);
        Assert.Equal(Player.SignupFreezeGift, m.StreakFreezes);
        Assert.False(m.StreakProtected);

        var a = Assert.Single(body.Players, p => p.Email == AdminEmail);
        Assert.True(a.IsAdmin);

        // L'admin vient de faire la requête : il est le plus récemment vu, donc en tête.
        Assert.Equal(AdminEmail, body.Players[0].Email);
    }

    [Fact]
    public async Task CompteNonAdmin_Retourne401()
    {
        var client = factory.CreateClient();
        await LinkPlayerAsync(client, MemberEmail, "PasAdmin");

        var resp = await client.GetAsync("/api/admin/players");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Historique_ListeLesPartiesDuJoueur()
    {
        var admin = factory.CreateClient();
        await LinkPlayerAsync(admin, AdminEmail, "ChefAdmin");
        await SetIsAdminAsync(AdminEmail);

        var member = factory.CreateClient();
        await LinkPlayerAsync(member, MemberEmail, "Membre");
        (await member.PostAsync("/api/sessions", null)).EnsureSuccessStatusCode();

        var memberId = await GetPlayerIdAsync(MemberEmail);
        var resp = await admin.GetAsync($"/api/admin/players/{memberId}/history");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadFromJsonAsync<PlayerHistoryResponse>();
        Assert.NotNull(body);
        var game = Assert.Single(body.Games);
        Assert.Equal(DateOnly.FromDateTime(DateTime.UtcNow), game.Date);
        Assert.Equal("Pending", game.Status);
        Assert.Null(game.Score);

        // Aucune partie : liste vide.
        var adminId = await GetPlayerIdAsync(AdminEmail);
        var empty = await admin.GetFromJsonAsync<PlayerHistoryResponse>($"/api/admin/players/{adminId}/history");
        Assert.NotNull(empty);
        Assert.Empty(empty.Games);
    }

    [Fact]
    public async Task Historique_CompteNonAdmin_Retourne401()
    {
        var client = factory.CreateClient();
        await LinkPlayerAsync(client, MemberEmail, "PasAdmin");
        var memberId = await GetPlayerIdAsync(MemberEmail);

        var resp = await client.GetAsync($"/api/admin/players/{memberId}/history");

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

    private async Task<Guid> GetPlayerIdAsync(string email)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Players.Where(p => p.Email == email).Select(p => p.Id).SingleAsync();
    }

    private async Task SetIsAdminAsync(string email)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player = await db.Players.SingleAsync(p => p.Email == email);
        player.PromoteToAdminForTesting();
        await db.SaveChangesAsync();
    }
}
