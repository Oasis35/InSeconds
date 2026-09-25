using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using InSeconds.Api.Common.Email;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Auth.VerifyMagicLink;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests.Auth;

[Collection("Integration")]
public class VerifyMagicLinkTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private const string TestEmail = "testeur@example.com";

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task VerifyMagicLink_PremiereConnexion_SansPseudo_ReturnsNeedsPseudo()
    {
        var client = factory.CreateClient();
        var token = await RequestAndExtractTokenAsync(client, TestEmail);

        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = (string?)null });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>();
        Assert.True(body!.NeedsPseudo);
    }

    [Fact]
    public async Task VerifyMagicLink_PremiereConnexion_AvecPseudo_ConvertitLeGuestCourant()
    {
        var client = factory.CreateClient();

        // Résout un guest sur ce client avant de vérifier le lien (peek settings suffit à
        // déclencher PlayerAuthMiddleware, mais sans créer de Player — on force la création
        // via un premier appel à /api/players/me, cohérent avec le comportement réel : le
        // front appelle GetCurrentPlayer via PlayerSessionService avant de proposer le login).
        var meBefore = await client.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        var token = await RequestAndExtractTokenAsync(client, TestEmail);
        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = "Testeur" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>();
        Assert.False(body!.NeedsPseudo);

        var meAfter = await client.GetFromJsonAsync<PlayerMeDto>("/api/players/me");
        Assert.Equal(meBefore!.PlayerId, meAfter!.PlayerId);
        Assert.False(meAfter.IsGuest);
        Assert.Equal(TestEmail, meAfter.Email);
        Assert.Equal("Testeur", meAfter.Pseudo);
        Assert.Equal(1, meAfter.Streak!.Freezes); // gel offert à l'inscription
    }

    [Fact]
    public async Task VerifyMagicLink_PseudoDejaPris_Returns409()
    {
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var existingPlayer = Player.CreateGuest(Guid.NewGuid(), Guid.NewGuid(), DateTime.UtcNow);
            existingPlayer.LinkToAccount("autrecompte@example.com", "PseudoPris");
            db.Players.Add(existingPlayer);
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var token = await RequestAndExtractTokenAsync(client, TestEmail);

        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = "PseudoPris" });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task VerifyMagicLink_PseudoDejaPris_Returns409_PuisReessaiAvecMemeToken_Succes()
    {
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var existingPlayer = Player.CreateGuest(Guid.NewGuid(), Guid.NewGuid(), DateTime.UtcNow);
            existingPlayer.LinkToAccount("autrecompte2@example.com", "DejaPris");
            db.Players.Add(existingPlayer);
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var token = await RequestAndExtractTokenAsync(client, TestEmail);

        var firstAttempt = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = "DejaPris" });
        Assert.Equal(HttpStatusCode.Conflict, firstAttempt.StatusCode);

        // Le token n'a pas été consommé par le 409 : un pseudo différent avec le même
        // token doit encore fonctionner (c'est le test qui aurait attrapé le bug d'ordre
        // de consommation du token, cf. plan).
        var secondAttempt = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = "PseudoLibre" });
        Assert.Equal(HttpStatusCode.OK, secondAttempt.StatusCode);
    }

    [Fact]
    public async Task VerifyMagicLink_PseudoCaracteresInterdits_Returns400()
    {
        var client = factory.CreateClient();
        var token = await RequestAndExtractTokenAsync(client, TestEmail);

        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = "<script>" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task VerifyMagicLink_CompteDejaLie_ReconnexionAutreAppareil_ResoutLeMemePlayer()
    {
        var deviceA = factory.CreateClient();
        var tokenA = await RequestAndExtractTokenAsync(deviceA, TestEmail);
        await deviceA.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = tokenA, Pseudo = "MultiDevice" });
        var meA = await deviceA.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        // Deuxième "appareil" = deuxième HttpClient sans cookie partagé
        var deviceB = factory.CreateClient();
        var tokenB = await RequestAndExtractTokenAsync(deviceB, TestEmail);
        var respB = await deviceB.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = tokenB, Pseudo = (string?)null });
        Assert.Equal(HttpStatusCode.OK, respB.StatusCode);
        var bodyB = await respB.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>();
        Assert.False(bodyB!.NeedsPseudo); // Found, pas NeedsPseudo — compte déjà lié

        var meB = await deviceB.GetFromJsonAsync<PlayerMeDto>("/api/players/me");
        Assert.Equal(meA!.PlayerId, meB!.PlayerId);
        Assert.Equal("MultiDevice", meB.Pseudo);
    }

    [Fact]
    public async Task VerifyMagicLink_NavigateurDejaConnecte_EmailInconnu_CreeUnNouveauCompteSansToucherAuPremier()
    {
        var client = factory.CreateClient();
        var ownerToken = await RequestAndExtractTokenAsync(client, TestEmail);
        await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = ownerToken, Pseudo = "Proprio" });
        var owner = await client.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        // Même navigateur, toujours connecté : lien pour une adresse sans compte.
        var otherToken = await RequestAndExtractTokenAsync(client, "autre@example.com");
        var needsPseudo = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = otherToken, Pseudo = (string?)null });
        Assert.True((await needsPseudo.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>())!.NeedsPseudo);

        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = otherToken, Pseudo = "Autre" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        // Le navigateur est désormais sur un compte neuf pour la nouvelle adresse…
        var now = await client.GetFromJsonAsync<PlayerMeDto>("/api/players/me");
        Assert.NotEqual(owner!.PlayerId, now!.PlayerId);
        Assert.Equal("autre@example.com", now.Email);
        Assert.Equal("Autre", now.Pseudo);

        // …et le premier compte est intact.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var ownerInDb = await db.Players.AsNoTracking().SingleAsync(p => p.Id == owner.PlayerId);
        Assert.Equal(TestEmail, ownerInDb.Email);
        Assert.Equal("Proprio", ownerInDb.Pseudo);
    }

    [Fact]
    public async Task VerifyMagicLink_LienDunTiersOuvertParUnJoueurConnecte_NeDonnePasAccesASonCompte()
    {
        // La victime est connectée sur son compte.
        var victim = factory.CreateClient();
        var victimToken = await RequestAndExtractTokenAsync(victim, TestEmail);
        await victim.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = victimToken, Pseudo = "Victime" });
        var victimMe = await victim.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        // L'attaquant demande un lien pour sa propre adresse, que la victime ouvre et confirme.
        var attacker = factory.CreateClient();
        var trapToken = await RequestAndExtractTokenAsync(attacker, "pirate@example.com");
        var trap = await victim.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = trapToken, Pseudo = "Pirate" });
        Assert.Equal(HttpStatusCode.OK, trap.StatusCode);

        // L'attaquant se reconnecte avec son adresse : il obtient le compte neuf, pas celui de la victime.
        var loginToken = await RequestAndExtractTokenAsync(attacker, "pirate@example.com");
        await attacker.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = loginToken, Pseudo = (string?)null });
        var attackerMe = await attacker.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        Assert.NotEqual(victimMe!.PlayerId, attackerMe!.PlayerId);
        Assert.Equal("pirate@example.com", attackerMe.Email);

        // La victime peut toujours se reconnecter à son compte avec son adresse.
        var againToken = await RequestAndExtractTokenAsync(victim, TestEmail);
        await victim.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = againToken, Pseudo = (string?)null });
        var victimAgain = await victim.GetFromJsonAsync<PlayerMeDto>("/api/players/me");
        Assert.Equal(victimMe.PlayerId, victimAgain!.PlayerId);
        Assert.Equal("Victime", victimAgain.Pseudo);
    }

    [Fact]
    public async Task VerifyMagicLink_Reconnexion_NeRedonnePasDeGel()
    {
        var deviceA = factory.CreateClient();
        var tokenA = await RequestAndExtractTokenAsync(deviceA, TestEmail);
        await deviceA.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = tokenA, Pseudo = "GelUnique" });
        var meA = await deviceA.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        // Le gel offert a été consommé entre-temps
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var player = await db.Players.FirstAsync(p => p.Id == meA!.PlayerId);
            player.RestoreStreakForTesting(3, DateOnly.FromDateTime(DateTime.UtcNow), streakFreezes: 0);
            await db.SaveChangesAsync();
        }

        var deviceB = factory.CreateClient();
        var tokenB = await RequestAndExtractTokenAsync(deviceB, TestEmail);
        await deviceB.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = tokenB, Pseudo = (string?)null });

        var meB = await deviceB.GetFromJsonAsync<PlayerMeDto>("/api/players/me");
        Assert.Equal(meA!.PlayerId, meB!.PlayerId);
        Assert.Equal(0, meB.Streak!.Freezes);
    }

    [Fact]
    public async Task VerifyMagicLink_TokenExpire_Returns400()
    {
        var client = factory.CreateClient();
        var token = await RequestAndExtractTokenAsync(client, TestEmail);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var stored = await db.MagicLinkTokens.SingleAsync(m => m.Email == TestEmail);
            stored.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = (string?)null });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task VerifyMagicLink_TokenDejaConsomme_Returns400()
    {
        var client = factory.CreateClient();
        var token = await RequestAndExtractTokenAsync(client, TestEmail);

        var first = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = "PremierEssai" });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var replay = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = token, Pseudo = (string?)null });

        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
    }

    [Fact]
    public async Task VerifyMagicLink_TokenInconnu_Returns400()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");

        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = "un-token-qui-n-existe-pas", Pseudo = (string?)null });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task VerifyMagicLink_OrigineNonAutorisee_Returns403()
    {
        var client = factory.CreateClient();
        var token = await RequestAndExtractTokenAsync(client, TestEmail);

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/magic-link/verify")
        {
            Content = JsonContent.Create(new { Token = token, Pseudo = (string?)null }),
        };
        req.Headers.Add("Origin", "https://evil.example.com");

        var resp = await client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async Task<string> RequestAndExtractTokenAsync(HttpClient client, string email)
    {
        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");

        await client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = email });

        var capture = factory.Services.GetRequiredService<TestEmailCapture>();
        Assert.True(capture.TryGetLast(email, out var lastEmail));

        var match = Regex.Match(lastEmail.Html, "href=\"([^\"]+)\"");
        Assert.True(match.Success);

        var url = match.Groups[1].Value;
        var tokenMatch = Regex.Match(url, "token=([^&]+)");
        Assert.True(tokenMatch.Success);

        return tokenMatch.Groups[1].Value;
    }

    private sealed record PlayerMeDto(Guid PlayerId, bool IsGuest, string? Email, string? Pseudo, StreakLiteDto? Streak = null);
    private sealed record StreakLiteDto(int Freezes);
}
