using InSeconds.Api.Infrastructure.Settings;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace InSeconds.IntegrationTests;

public class SettingsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public sealed class TestOptions
    {
        public int Value { get; set; } = 1;
        public decimal[] Durations { get; set; } = [];
        public Dictionary<int, int> Penalties { get; set; } = [];
    }

    public async ValueTask InitializeAsync()
    {
        _api = new ApiFactory(await postgres.CreateDatabaseAsync(),
            services => services.AddOptions<TestOptions>().BindConfiguration("Test"));
        // Le démarrage de l'API applique les migrations.
        _ = _api.Services;
    }

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    private TestOptions Current => _api.Services.GetRequiredService<IOptionsMonitor<TestOptions>>().CurrentValue;

    [Fact]
    public void SansLigneEnBase_LaValeurParDefautSApplique()
    {
        Assert.Equal(1, Current.Value);
    }

    [Fact]
    public async Task SetAsync_LaNouvelleValeurEstLueSansRedemarrer()
    {
        await SetAsync("Test:Value", 42);
        Assert.Equal(42, Current.Value);

        await SetAsync("Test:Value", 43);
        Assert.Equal(43, Current.Value);
    }

    [Fact]
    public async Task SetAsync_TableauEtDictionnaire_SontLiesAuxOptions()
    {
        await SetAsync("Test:Durations", new[] { 0.5m, 1m, 2m });
        await SetAsync("Test:Penalties", new Dictionary<string, int> { ["1"] = 30, ["2"] = 60 });

        Assert.Equal([0.5m, 1m, 2m], Current.Durations);
        Assert.Equal(30, Current.Penalties[1]);
        Assert.Equal(60, Current.Penalties[2]);
    }

    [Fact]
    public async Task SetAsync_TableauRaccourci_NeGardePasLesAnciennesValeurs()
    {
        await SetAsync("Test:Durations", new[] { 0.5m, 1m, 2m });
        await SetAsync("Test:Durations", new[] { 5m });

        Assert.Equal([5m], Current.Durations);
    }

    [Fact]
    public async Task LigneEcriteEnSql_PriseEnCompteAuRechargement()
    {
        await using (var connection = new NpgsqlConnection(_api.ConnectionString))
        {
            await connection.OpenAsync(TestContext.Current.CancellationToken);
            await using var command = new NpgsqlCommand(
                "INSERT INTO infra.settings (key, value, updated_at) VALUES ('Test:Value', '7', now())", connection);
            await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        _api.Services.GetRequiredService<ISettingsReloader>().Reload();

        Assert.Equal(7, Current.Value);
    }

    private async Task SetAsync<T>(string key, T value)
    {
        await using var scope = _api.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<SettingsStore>()
            .SetAsync(key, value, TestContext.Current.CancellationToken);
    }
}
