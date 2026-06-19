using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Respawn;
using Testcontainers.PostgreSql;

namespace InSeconds.Api.IntegrationTests;

public class IntegrationTestFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("inseconds_test")
        .WithUsername("inseconds")
        .WithPassword("inseconds_test")
        .Build();

    private Respawner _respawner = null!;
    private NpgsqlConnection _connection = null!;

    public HttpClient Client { get; private set; } = null!;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            // Remplace la connection string par celle du container
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<ApplicationDbContext>));
            if (descriptor != null)
                services.Remove(descriptor);

            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseNpgsql(_postgres.GetConnectionString()));
        });

        // Override aussi la connection string dans IConfiguration pour AppDbConfigurationProvider
        builder.UseSetting(
            "ConnectionStrings:DefaultConnection",
            _postgres.GetConnectionString());
    }

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        Client = CreateClient();

        // Déclenche le startup (migration + seed) via le premier appel HTTP
        var resp = await Client.GetAsync("/api/settings");
        resp.EnsureSuccessStatusCode();

        _connection = new NpgsqlConnection(_postgres.GetConnectionString());
        await _connection.OpenAsync();

        _respawner = await Respawner.CreateAsync(_connection, new RespawnerOptions
        {
            DbAdapter = DbAdapter.Postgres,
            TablesToIgnore = ["__EFMigrationsHistory", "Settings", "Tracks", "DailyChallenges", "DailyChallengeTracks"],
        });
    }

    public async Task ResetAsync() => await _respawner.ResetAsync(_connection);

    // xUnit v3 : IAsyncLifetime.DisposeAsync retourne ValueTask
    async Task IAsyncLifetime.DisposeAsync()
    {
        await _connection.DisposeAsync();
        await _postgres.DisposeAsync();
        await base.DisposeAsync();
    }
}
