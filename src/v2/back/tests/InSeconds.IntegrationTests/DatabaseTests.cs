using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests;

public class DatabaseTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync()
    {
        _api = new ApiFactory(await postgres.CreateDatabaseAsync());
        // Le démarrage de l'API applique les migrations.
        _ = _api.Services;
    }

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task Demarrage_CreeLesSchemasV2()
    {
        Assert.Equal(2L, await _api.ScalarAsync<long>(
            "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('infra', 'extensions')"));
    }

    [Fact]
    public async Task Demarrage_NeCreeRienDansPublic()
    {
        Assert.Equal(0L, await _api.ScalarAsync<long>(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"));
    }

    [Fact]
    public async Task HistoriqueDesMigrations_EstDansInfra()
    {
        Assert.Equal(1L, await _api.ScalarAsync<long>(
            "SELECT count(*) FROM infra.__ef_migrations_history WHERE migration_id LIKE '%_InitialCreate'"));
    }

    [Fact]
    public async Task Citext_EstInstalleDansExtensions_EtIgnoreLaCasse()
    {
        Assert.Equal("extensions", await _api.ScalarAsync<string>(
            "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'citext'"));
    }

    [Fact]
    public async Task Citext_ComparaisonSansCasse_AvecLaConnexionDeLApi()
    {
        await using var scope = _api.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<InSecondsDbContext>();

        var equal = await db.Database
            .SqlQueryRaw<bool>("SELECT 'Bob'::extensions.citext = 'bob'::extensions.citext AS \"Value\"")
            .SingleAsync(TestContext.Current.CancellationToken);

        Assert.True(equal);
    }
}
