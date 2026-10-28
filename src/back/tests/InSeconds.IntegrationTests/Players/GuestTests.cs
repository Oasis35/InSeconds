using System.Net;
using System.Net.Http.Json;
using System.Text;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Application;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;

namespace InSeconds.IntegrationTests.Players;

/// <summary><c>POST /api/players/guest</c> et <c>GET /api/players/me</c> (§ 5.5 et 5.6 du plan v2).</summary>
public class GuestTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task CreationDInvite_PoseLeCookieEtCreeLeJoueurEtSonAppareil()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().PostAsync("/api/players/guest", null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var guest = await response.Content.ReadFromJsonAsync<GuestResponse>(Ct);
        // En test (HTTP local) : ni préfixe __Host- ni Secure, SameSite=Strict.
        var cookie = CookieHeaders.Find(response, "inseconds");
        Assert.NotNull(cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("expires=", cookie, StringComparison.OrdinalIgnoreCase);
        // Le ticket ne porte que le joueur et son appareil.
        Assert.Equal(
            [PlayerClaims.PlayerId, PlayerClaims.DeviceSessionId],
            CookieHeaders.Ticket(api.Services, response, "inseconds").Claims.Select(c => c.Type));
        Assert.Equal(1L, await api.ScalarAsync<long>($"SELECT count(*) FROM players.players WHERE id = '{guest!.PlayerId}'"));
        Assert.Equal(1L, await api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{guest.PlayerId}'"));
        Assert.Equal(0L, await api.ScalarAsync<long>("SELECT count(*) FROM players.accounts"));
        // Sans corps (un front d'avant la source d'arrivée) : arrivée directe.
        Assert.Equal("direct", await SourceAsync(api, guest.PlayerId));
    }

    [Theory]
    [InlineData("{\"source\":\"Instagram\"}", "instagram")]
    [InlineData("{\"source\":\"google.com\"}", "google.com")]
    [InlineData("{\"source\":\"alice@example.com\"}", "other")]
    [InlineData("{\"source\":\"une source bien trop longue pour etre gardee telle quelle\"}", "other")]
    [InlineData("{\"source\":null}", "direct")]
    [InlineData("{}", "direct")]
    public async Task CreationDInvite_SourceDArriveeNettoyee(string body, string expected)
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().PostAsync(
            "/api/players/guest", new StringContent(body, Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var guest = (await response.Content.ReadFromJsonAsync<GuestResponse>(Ct))!;
        Assert.Equal(expected, await SourceAsync(api, guest.PlayerId));
    }

    [Fact]
    public async Task NavigateurDejaIdentifie_GardeSaSourceDArrivee()
    {
        await using var api = new ApiFactory(_connectionString);
        var client = api.CreateClient();

        var first = await client.PostAsJsonAsync("/api/players/guest", new CreateGuest("instagram"), Ct);
        var second = await client.PostAsJsonAsync("/api/players/guest", new CreateGuest("tiktok"), Ct);

        var playerId = (await first.Content.ReadFromJsonAsync<GuestResponse>(Ct))!.PlayerId;
        Assert.Equal(playerId, (await second.Content.ReadFromJsonAsync<GuestResponse>(Ct))!.PlayerId);
        Assert.Equal("instagram", await SourceAsync(api, playerId));
    }

    [Fact]
    public async Task NavigateurDejaIdentifie_GardeSonJoueur()
    {
        await using var api = new ApiFactory(_connectionString);
        var client = api.CreateClient();

        var first = await PostGuestAsync(client);
        var second = await PostGuestAsync(client);

        Assert.Equal(first, second);
        Assert.Equal(1L, await api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
        Assert.Equal(1L, await api.ScalarAsync<long>("SELECT count(*) FROM players.device_sessions"));
    }

    [Fact]
    public async Task Me_SansIdentite_204_EtNeCreeAucunJoueur()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().GetAsync("/api/players/me", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(CookieHeaders.All(response));
        Assert.Equal(0L, await api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
    }

    [Fact]
    public async Task Me_Invite()
    {
        await using var api = new ApiFactory(_connectionString);
        var client = api.CreateClient();
        var playerId = await PostGuestAsync(client);

        var me = await client.GetFromJsonAsync<PlayerMeResponse>("/api/players/me", Ct);

        Assert.Equal(new PlayerMeResponse(playerId, IsGuest: true, Email: null, Pseudo: null, IsAdmin: false), me);
    }

    [Fact]
    public async Task Me_AvecUnCompte()
    {
        await using var api = new ApiFactory(_connectionString);
        var client = api.CreateClient();
        var playerId = await PostGuestAsync(client);
        await api.ExecuteAsync(
            $"INSERT INTO players.accounts (player_id, email, pseudo) VALUES ('{playerId}', 'bob@example.com', 'Bob')");

        var me = await client.GetFromJsonAsync<PlayerMeResponse>("/api/players/me", Ct);

        Assert.Equal(new PlayerMeResponse(playerId, IsGuest: false, "bob@example.com", "Bob", IsAdmin: false), me);
    }

    [Fact]
    public async Task RateLimiting_CreationDInvite_30Par10Minutes_PuisEn429()
    {
        await using var api = new ApiFactory(_connectionString,
            settings: new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });
        // Sans cookie : chaque appel est un nouveau navigateur.
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

        for (var i = 0; i < 30; i++)
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/players/guest", null, Ct)).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsync("/api/players/guest", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task Staging_CookieHostSecureLax()
    {
        await using var api = new ApiFactory(_connectionString, environment: Environments.Staging,
            settings: TestCertificate.StagingSettings());

        var response = await api.CreateClient().PostAsync("/api/players/guest", null, Ct);

        var cookie = CookieHeaders.Find(response, "__Host-inseconds");
        Assert.NotNull(cookie);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("domain=", cookie, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<Guid> PostGuestAsync(HttpClient client)
    {
        var response = await client.PostAsync("/api/players/guest", null, Ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<GuestResponse>(Ct))!.PlayerId;
    }

    private static Task<string?> SourceAsync(ApiFactory api, Guid playerId) =>
        api.ScalarAsync<string?>($"SELECT acquisition_source FROM players.players WHERE id = '{playerId}'");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
