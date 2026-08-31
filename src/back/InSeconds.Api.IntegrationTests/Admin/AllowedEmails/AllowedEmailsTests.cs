using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.AllowedEmails.AddAllowedEmail;
using InSeconds.Api.Features.Admin.AllowedEmails.GetAllowedEmails;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests.Admin.AllowedEmails;

[Collection("Integration")]
public class AllowedEmailsTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task AddAllowedEmail_Succes()
    {
        var resp = await AdminPostAsync("/api/admin/allowed-emails", new { Email = "nouveau@example.com" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<AddAllowedEmailResponse>();
        Assert.Equal("nouveau@example.com", body!.Email);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.True(await db.AllowedEmails.AnyAsync(a => a.Email == "nouveau@example.com"));
    }

    [Fact]
    public async Task AddAllowedEmail_Succes_DeclencheUnTokenMagicLinkDe7Jours()
    {
        var resp = await AdminPostAsync("/api/admin/allowed-emails", new { Email = "invite@example.com" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var token = await db.MagicLinkTokens.SingleAsync(m => m.Email == "invite@example.com");

        var expectedExpiry = DateTime.UtcNow.AddDays(7);
        Assert.True(Math.Abs((token.ExpiresAt - expectedExpiry).TotalMinutes) < 2);
    }

    [Fact]
    public async Task AddAllowedEmail_Doublon_Returns409()
    {
        await AdminPostAsync("/api/admin/allowed-emails", new { Email = "doublon@example.com" });
        var resp = await AdminPostAsync("/api/admin/allowed-emails", new { Email = "doublon@example.com" });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task AddAllowedEmail_FormatInvalide_Returns400()
    {
        var resp = await AdminPostAsync("/api/admin/allowed-emails", new { Email = "pas-un-email" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task AddAllowedEmail_OrigineNonAutorisee_Returns401()
    {
        // IsAdminAuthenticated combine le check du Bearer token et le check d'origine
        // dans un seul booléen — les deux causes d'échec ressortent en 401, sans
        // distinction (contrairement à VerifyMagicLink qui a un check d'origine séparé
        // renvoyant 403). Comportement volontaire : ne pas révéler à un appelant non
        // authentifié laquelle des deux vérifications a échoué.
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/admin/allowed-emails")
        {
            Content = JsonContent.Create(new { Email = "origine@example.com" }),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        req.Headers.Add("Origin", "https://evil.example.com");

        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task RemoveAllowedEmail_Succes()
    {
        var addResp = await AdminPostAsync("/api/admin/allowed-emails", new { Email = "a-supprimer@example.com" });
        var added = await addResp.Content.ReadFromJsonAsync<AddAllowedEmailResponse>();

        var req = new HttpRequestMessage(HttpMethod.Delete, $"/api/admin/allowed-emails/{added!.Id}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await db.AllowedEmails.AnyAsync(a => a.Id == added.Id));
    }

    [Fact]
    public async Task RemoveAllowedEmail_Introuvable_Returns404()
    {
        var req = new HttpRequestMessage(HttpMethod.Delete, "/api/admin/allowed-emails/999999");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task RemoveAllowedEmail_CompteDejaActif_SupprimeEntreeSansToucherAuPlayer()
    {
        const string email = "compte-actif@example.com";

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var allowed = new AllowedEmail { Email = email, CreatedAt = DateTime.UtcNow };
            db.AllowedEmails.Add(allowed);
            db.Players.Add(new Player
            {
                Id = Guid.NewGuid(),
                IsGuest = false,
                Email = email,
                Pseudo = "CompteActif",
                AuthToken = Guid.NewGuid(),
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        int allowedId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            allowedId = (await db.AllowedEmails.SingleAsync(a => a.Email == email)).Id;
        }

        var req = new HttpRequestMessage(HttpMethod.Delete, $"/api/admin/allowed-emails/{allowedId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var finalScope = factory.Services.CreateScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await finalDb.AllowedEmails.AnyAsync(a => a.Id == allowedId));
        var player = await finalDb.Players.SingleAsync(p => p.Email == email);
        Assert.False(player.IsGuest);
        Assert.Equal("CompteActif", player.Pseudo);
    }

    [Fact]
    public async Task GetAllowedEmails_EmailUtilisePourUnCompteLie_IsActivatedTrue()
    {
        const string email = "actif@example.com";
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.AllowedEmails.Add(new AllowedEmail { Email = email, CreatedAt = DateTime.UtcNow });
            db.Players.Add(new Player
            {
                Id = Guid.NewGuid(),
                IsGuest = false,
                Email = email,
                Pseudo = "Actif",
                AuthToken = Guid.NewGuid(),
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/allowed-emails");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        var resp = await _client.SendAsync(req);
        var body = await resp.Content.ReadFromJsonAsync<GetAllowedEmailsResponse>();

        var entry = body!.Emails.Single(e => e.Email == email);
        Assert.True(entry.IsActivated);
    }

    [Fact]
    public async Task GetAllowedEmails_EmailNonUtilise_IsActivatedFalse()
    {
        await AdminPostAsync("/api/admin/allowed-emails", new { Email = "en-attente@example.com" });

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/allowed-emails");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        var resp = await _client.SendAsync(req);
        var body = await resp.Content.ReadFromJsonAsync<GetAllowedEmailsResponse>();

        var entry = body!.Emails.Single(e => e.Email == "en-attente@example.com");
        Assert.False(entry.IsActivated);
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
