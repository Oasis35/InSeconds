using System.Text.Json;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Modules.Players.Application;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Commandes de secours <c>--export-player</c> et <c>--delete-player</c> (demande reçue par email) : le même JSON et le même effacement que
/// le profil, sans démarrer l'API.
/// </summary>
public class PlayerDataCommandTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;
    private Guid _playerId;

    public async ValueTask InitializeAsync()
    {
        _api = new ApiFactory(await postgres.CreateDatabaseAsync());
        _ = _api.Server;
        await PlayerDataSeed.AddChallengeAsync(_api);
        _playerId = Guid.NewGuid();
        await _api.ExecuteAsync($"""
            INSERT INTO players.players (id, created_at, last_seen_at) VALUES ('{_playerId}', now(), now());
            INSERT INTO players.accounts (player_id, email, pseudo) VALUES ('{_playerId}', 'secours@example.com', 'Secours');
            INSERT INTO players.device_sessions (id, player_id, created_at, last_seen_at, user_agent_label) VALUES (900001, '{_playerId}', now(), now(), 'Chrome · Android');
            """);
        await PlayerDataSeed.AddGameAsync(_api, _playerId);
    }

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task Export_EcritLeJsonSurLaSortie_SansRienModifier()
    {
        var output = new StringWriter();

        // L'adresse est retrouvée sans casse ni espaces, comme à la connexion.
        var exitCode = await RunAsync([PlayerDataCommand.ExportFlag, " Secours@Example.com "], output);

        Assert.Equal(0, exitCode);
        var export = JsonSerializer.Deserialize<PlayerDataExport>(output.ToString(), JsonSerializerOptions.Web)!;
        Assert.Equal(_playerId, export.PlayerId);
        Assert.Equal("Secours", export.Account!.Pseudo);
        Assert.Equal("Chrome · Android", Assert.Single(export.Devices).Label);
        Assert.Equal(2, Assert.Single(ExportReading.Daily(export).Games).Tracks.Count);
        Assert.Equal(1L, await _api.ScalarAsync<long>("SELECT count(*) FROM players.accounts"));
    }

    [Fact]
    public async Task Suppression_EffaceLeCompte()
    {
        var exitCode = await RunAsync([PlayerDataCommand.DeleteFlag, "secours@example.com"]);

        Assert.Equal(0, exitCode);
        Assert.Equal(0L, await _api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
        Assert.Equal(0L, await _api.ScalarAsync<long>("SELECT count(*) FROM players.device_sessions"));
        Assert.Equal(0L, await _api.ScalarAsync<long>("SELECT count(*) FROM daily.sessions"));
        Assert.Equal(0L, await _api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
    }

    [Theory]
    [InlineData(PlayerDataCommand.ExportFlag)]
    [InlineData(PlayerDataCommand.DeleteFlag)]
    public async Task AdresseInconnue_Code2_RienNEstTouche(string flag)
    {
        var output = new StringWriter();

        Assert.Equal(PlayerDataCommand.NotFound, await RunAsync([flag, "inconnu@example.com"], output));
        Assert.Empty(output.ToString());
        Assert.Equal(1L, await _api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
    }

    [Fact]
    public async Task AdresseManquante_Code64() =>
        Assert.Equal(PlayerDataCommand.Usage, await RunAsync([PlayerDataCommand.DeleteFlag]));

    private Task<int> RunAsync(string[] args, TextWriter? output = null) =>
        PlayerDataCommand.RunAsync(
            [.. args, $"--ConnectionStrings:DefaultConnection={_api.ConnectionString}"], output, TestContext.Current.CancellationToken);
}
