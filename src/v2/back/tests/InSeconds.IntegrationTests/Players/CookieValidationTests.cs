using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Validation du cookie à chaque requête (§ 5.5 du plan v2) : appareil vérifié en base et rôle admin
/// relu, au plus une minute de retard ; dernière visite toutes les 5 minutes (R17) ; une erreur de base
/// ne déconnecte jamais (piège 37). L'horloge est simulée pour franchir la minute.
/// </summary>
public class CookieValidationTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateTimeOffset Start = new(2026, 10, 3, 12, 0, 0, TimeSpan.Zero);
    private readonly FakeTimeProvider _time = new(Start);
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() =>
        _api = new ApiFactory(await postgres.CreateDatabaseAsync(), services => services.AddSingleton<TimeProvider>(_time));

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task Revocation_EffectiveEnMoinsDUneMinute()
    {
        var client = _api.CreateClient();
        var playerId = await PostGuestAsync(client);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/players/me", Ct)).StatusCode);

        await _api.ExecuteAsync($"UPDATE players.device_sessions SET revoked_at = now() WHERE player_id = '{playerId}'");
        // Encore dans la minute : le résultat de la dernière vérification sert toujours.
        _time.Advance(TimeSpan.FromSeconds(30));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/players/me", Ct)).StatusCode);

        _time.Advance(TimeSpan.FromSeconds(31));
        var rejected = await client.GetAsync("/api/players/me", Ct);

        Assert.Equal(HttpStatusCode.NoContent, rejected.StatusCode);
        Assert.True(CookieHeaders.Deletes(rejected, "inseconds"));
    }

    [Fact]
    public async Task RetraitDuRoleAdmin_EffectifEnMoinsDUneMinute()
    {
        var client = _api.CreateClient();
        var playerId = await PostGuestAsync(client);
        await _api.ExecuteAsync(
            $"INSERT INTO players.accounts (player_id, email, pseudo, is_admin) VALUES ('{playerId}', 'admin@example.com', 'Admin', true)");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/me", Ct)).StatusCode);

        await _api.ExecuteAsync($"UPDATE players.accounts SET is_admin = false WHERE player_id = '{playerId}'");
        _time.Advance(TimeSpan.FromSeconds(61));

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/me", Ct)).StatusCode);
    }

    [Fact]
    public async Task RoleAdmin_LuEnBase_PasDansLeCookie()
    {
        var client = _api.CreateClient();
        var playerId = await PostGuestAsync(client);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/me", Ct)).StatusCode);

        await _api.ExecuteAsync(
            $"INSERT INTO players.accounts (player_id, email, pseudo, is_admin) VALUES ('{playerId}', 'admin@example.com', 'Admin', true)");
        _time.Advance(TimeSpan.FromSeconds(61));

        var admin = await client.GetFromJsonAsync<AdminMeResponse>("/api/admin/me", Ct);
        Assert.Equal(playerId, admin!.PlayerId);
    }

    [Fact]
    public async Task JoueurSupprime_CookieRejete()
    {
        var client = _api.CreateClient();
        var playerId = await PostGuestAsync(client);

        await _api.ExecuteAsync($"UPDATE players.players SET deleted_at = now() WHERE id = '{playerId}'");
        _time.Advance(TimeSpan.FromSeconds(61));

        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/players/me", Ct)).StatusCode);
    }

    [Fact]
    public async Task DerniereVisite_NoteeAuPlusToutesLes5Minutes()
    {
        var client = _api.CreateClient();
        var playerId = await PostGuestAsync(client);

        _time.Advance(TimeSpan.FromMinutes(4));
        await client.GetAsync("/api/players/me", Ct);
        Assert.Equal(Start, await LastSeenAsync("players.device_sessions", "player_id", playerId), TimeSpan.FromMilliseconds(1));
        Assert.Equal(Start, await LastSeenAsync("players.players", "id", playerId), TimeSpan.FromMilliseconds(1));

        _time.Advance(TimeSpan.FromMinutes(2));
        await client.GetAsync("/api/players/me", Ct);

        var expected = Start.AddMinutes(6);
        Assert.Equal(expected, await LastSeenAsync("players.device_sessions", "player_id", playerId), TimeSpan.FromMilliseconds(1));
        Assert.Equal(expected, await LastSeenAsync("players.players", "id", playerId), TimeSpan.FromMilliseconds(1));
    }

    [Fact]
    public async Task CookieIllisible_Anonyme()
    {
        var client = _api.CreateClient();
        client.DefaultRequestHeaders.Add("Cookie", "inseconds=pas-un-ticket");

        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/players/me", Ct)).StatusCode);
    }

    [Fact]
    public async Task ErreurDeBase_500_SansDeconnecterNiCreerDInvite()
    {
        // Piège 37 : une base indisponible ne doit jamais passer pour un cookie invalide.
        await using var api = new ApiFactory(_api.ConnectionString, services =>
        {
            services.AddSingleton<TimeProvider>(_time);
            services.AddScoped<IPlayerSessions, UnavailablePlayerSessions>();
        });
        var client = api.CreateClient();
        await PostGuestAsync(client);

        var me = await client.GetAsync("/api/players/me", Ct);
        var guest = await client.PostAsync("/api/players/guest", null, Ct);

        Assert.Equal(HttpStatusCode.InternalServerError, me.StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError, guest.StatusCode);
        Assert.Empty(CookieHeaders.All(me));
        Assert.Empty(CookieHeaders.All(guest));
        Assert.Equal(1L, await api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
        var problem = await me.Content.ReadFromJsonAsync<Dictionary<string, object>>(Ct);
        Assert.Equal(ErrorCodes.Unexpected, problem!["code"].ToString());
    }

    private async Task<DateTimeOffset> LastSeenAsync(string table, string playerColumn, Guid playerId) =>
        await _api.ScalarAsync<DateTime>($"SELECT last_seen_at FROM {table} WHERE {playerColumn} = '{playerId}'");

    private static async Task<Guid> PostGuestAsync(HttpClient client)
    {
        var response = await client.PostAsync("/api/players/guest", null, Ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<GuestResponse>(Ct))!.PlayerId;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

/// <summary>La base ne répond plus.</summary>
internal sealed class UnavailablePlayerSessions : IPlayerSessions
{
    public Task<DeviceSessionStatus> GetStatusAsync(Guid playerId, int deviceSessionId, CancellationToken ct) =>
        throw new TimeoutException("base indisponible");

    public Task RecordSeenAsync(Guid playerId, int deviceSessionId, DateTimeOffset now, CancellationToken ct) =>
        throw new TimeoutException("base indisponible");

    public Task<OpenedDeviceSession?> OpenFromLegacyTokenAsync(Guid legacyAuthToken, DateTimeOffset now, string? userAgentLabel, CancellationToken ct) =>
        throw new TimeoutException("base indisponible");
}
