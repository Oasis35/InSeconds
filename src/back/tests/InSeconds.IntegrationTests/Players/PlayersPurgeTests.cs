using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Players.Application;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Tâche <c>players-purge-expired-tokens</c>, appelée directement (§ 5.4 bis du plan v2) : les durées de conservation des données des joueurs
/// (<see cref="PlayerRetention"/>).
/// </summary>
public class PlayersPurgeTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync()
    {
        _api = new ApiFactory(await postgres.CreateDatabaseAsync());
        _ = _api.Server;
    }

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task SupprimeLesJetonsExpires_GardeLesAutres()
    {
        var playerId = await AddPlayerAsync("now()");
        await _api.ExecuteAsync($"""
            INSERT INTO players.auth_tokens (purpose, email, token_hash, created_at, expires_at, consumed_at) VALUES
              (1, 'expire@example.com', '\x01', now() - interval '1 hour', now() - interval '45 minutes', NULL),
              (1, 'utilise@example.com', '\x02', now() - interval '1 hour', now() - interval '45 minutes', now() - interval '50 minutes'),
              (1, 'valable@example.com', '\x03', now(), now() + interval '15 minutes', NULL);
            INSERT INTO players.auth_tokens (purpose, player_id, new_email, token_hash, created_at, expires_at) VALUES
              (2, '{playerId}', 'expire2@example.com', '\x04', now() - interval '1 hour', now() - interval '45 minutes');
            """);

        var report = await RunAsync();

        Assert.Equal(3, report["tokens"]);
        Assert.Equal("valable@example.com", await _api.ScalarAsync<string>("SELECT email::text FROM players.auth_tokens"));
    }

    [Fact]
    public async Task SupprimeLesAppareilsQuiNePeuventPlusServir()
    {
        var playerId = await AddPlayerAsync("now()");
        await _api.ExecuteAsync($"""
            INSERT INTO players.device_sessions (id, player_id, created_at, last_seen_at, revoked_at) VALUES
              (900001, '{playerId}', now() - interval '200 days', now() - interval '92 days', NULL),
              (900002, '{playerId}', now() - interval '200 days', now() - interval '89 days', NULL),
              (900003, '{playerId}', now() - interval '200 days', now() - interval '95 days', now() - interval '89 days'),
              (900004, '{playerId}', now() - interval '200 days', now() - interval '100 days', now() - interval '92 days'),
              (900005, '{playerId}', now() - interval '1 day', now(), NULL);
            """);

        var report = await RunAsync();

        // Sans visite depuis plus que la durée du cookie (90 jours, une journée de marge), ou révoqué depuis aussi longtemps.
        Assert.Equal(3, report["devices"]);
        var left = await _api.ScalarAsync<int[]>("SELECT array_agg(id ORDER BY id) FROM players.device_sessions");
        Assert.Equal(new[] { 900002, 900005 }, left);
    }

    [Fact]
    public async Task EffaceLesComptesInactifsDepuis3Ans_PasLesAdminsNiLesInvites()
    {
        await PlayerDataSeed.AddChallengeAsync(_api);
        var inactive = await AddPlayerAsync("now() - interval '1100 days'", "inactif");
        var neverSeen = await AddPlayerAsync("NULL", "jamaisvu", createdAt: "now() - interval '1100 days'");
        var admin = await AddPlayerAsync("now() - interval '1100 days'", "admin", isAdmin: true);
        var recent = await AddPlayerAsync("now() - interval '1000 days'", "recent");
        var guest = await AddPlayerAsync("now() - interval '1100 days'");
        await PlayerDataSeed.AddGameAsync(_api, inactive);
        await PlayerDataSeed.AddGameAsync(_api, guest);
        await _api.ExecuteAsync($"INSERT INTO daily.streaks (player_id, current_streak, freezes) VALUES ('{inactive}', 0, 1)");

        var report = await RunAsync();

        Assert.Equal(2, report["accounts"]);
        Assert.Equal(
            new[] { admin, recent, guest }.Order().ToArray(),
            (await _api.ScalarAsync<Guid[]>("SELECT array_agg(id) FROM players.players"))!.Order().ToArray());
        Assert.Equal(0L, await _api.ScalarAsync<long>(
            $"SELECT count(*) FROM players.accounts WHERE player_id IN ('{inactive}', '{neverSeen}')"));
        Assert.Equal(0L, await _api.ScalarAsync<long>($"SELECT count(*) FROM daily.streaks WHERE player_id = '{inactive}'"));
        // Les parties d'un invité restent, anonymes : plus rien ne permet de le retrouver une fois ses appareils effacés.
        var played = await _api.ScalarAsync<Guid[]>("SELECT array_agg(player_id) FROM daily.sessions");
        Assert.Equal(new[] { guest }, played);
    }

    [Fact]
    public async Task RienAPurger_CompteRenduAZero()
    {
        var report = await RunAsync();

        Assert.Equal(0, report["tokens"]);
        Assert.Equal(0, report["devices"]);
        Assert.Equal(0, report["accounts"]);
    }

    [Fact]
    public async Task UneEtapeEnEchec_LesAutresPassent_PuisLaTacheEchoue()
    {
        await _api.ExecuteAsync("""
            INSERT INTO players.auth_tokens (purpose, email, token_hash, created_at, expires_at) VALUES
              (1, 'expire@example.com', '\x01', now() - interval '1 hour', now() - interval '45 minutes');
            ALTER TABLE players.device_sessions RENAME TO device_sessions_hors_service;
            """);
        await using var scope = _api.Services.CreateAsyncScope();

        var error = await Assert.ThrowsAsync<JobFailedException>(
            () => scope.ServiceProvider.GetRequiredService<PlayersPurgeJob>().RunAsync(TestContext.Current.CancellationToken));

        Assert.Equal(PlayersPurgeJob.FailedCode, error.Code);
        Assert.Equal(0L, await _api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens"));
    }

    private async Task<Dictionary<string, object?>> RunAsync()
    {
        await using var scope = _api.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<PlayersPurgeJob>().RunAsync(TestContext.Current.CancellationToken);
        return Assert.IsType<Dictionary<string, object?>>(result);
    }

    private async Task<Guid> AddPlayerAsync(string lastSeenAt, string? pseudo = null, bool isAdmin = false, string createdAt = "now() - interval '2000 days'")
    {
        var id = Guid.NewGuid();
        await _api.ExecuteAsync($"INSERT INTO players.players (id, created_at, last_seen_at) VALUES ('{id}', {createdAt}, {lastSeenAt})");
        if (pseudo is not null)
            await _api.ExecuteAsync(
                $"INSERT INTO players.accounts (player_id, email, pseudo, is_admin) VALUES ('{id}', '{pseudo}@example.com', '{pseudo}', {isAdmin})");
        return id;
    }
}
