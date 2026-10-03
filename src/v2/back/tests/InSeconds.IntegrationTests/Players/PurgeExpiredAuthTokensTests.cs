using InSeconds.Api.Modules.Players.Application;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Players;

/// <summary>Tâche <c>players-purge-expired-tokens</c>, appelée directement (§ 5.4 bis du plan v2).</summary>
public class PurgeExpiredAuthTokensTests(PostgresFixture postgres)
{
    [Fact]
    public async Task SupprimeLesJetonsExpires_GardeLesAutres()
    {
        await using var api = new ApiFactory(await postgres.CreateDatabaseAsync());
        _ = api.Server;
        var playerId = Guid.NewGuid();
        await api.ExecuteAsync($"""
            INSERT INTO players.players (id, created_at) VALUES ('{playerId}', now());
            INSERT INTO players.auth_tokens (purpose, email, token_hash, created_at, expires_at, consumed_at) VALUES
              (1, 'expire@example.com', '\x01', now() - interval '1 hour', now() - interval '45 minutes', NULL),
              (1, 'utilise@example.com', '\x02', now() - interval '1 hour', now() - interval '45 minutes', now() - interval '50 minutes'),
              (1, 'valable@example.com', '\x03', now(), now() + interval '15 minutes', NULL);
            INSERT INTO players.auth_tokens (purpose, player_id, new_email, token_hash, created_at, expires_at) VALUES
              (2, '{playerId}', 'expire2@example.com', '\x04', now() - interval '1 hour', now() - interval '45 minutes');
            """);

        await using var scope = api.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<PurgeExpiredAuthTokensJob>()
            .RunAsync(TestContext.Current.CancellationToken);

        Assert.Equal(new PurgedAuthTokens(3), result);
        Assert.Equal("valable@example.com", await api.ScalarAsync<string>("SELECT email::text FROM players.auth_tokens"));
    }
}
