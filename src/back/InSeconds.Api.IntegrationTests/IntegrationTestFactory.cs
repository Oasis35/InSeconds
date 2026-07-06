using System.Net.Http.Headers;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace InSeconds.Api.IntegrationTests;

public class IntegrationTestFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("inseconds_test")
        .WithUsername("inseconds")
        .WithPassword("inseconds_test")
        .Build();

    public HttpClient Client { get; private set; } = null!;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<ApplicationDbContext>));
            if (descriptor != null)
                services.Remove(descriptor);

            // Miroir de Program.cs : AddDbContextFactory (options singleton + contexte scoped),
            // sinon la factory singleton ne peut pas consommer des options scoped.
            services.AddDbContextFactory<ApplicationDbContext>(options =>
                options.UseNpgsql(_postgres.GetConnectionString()));
        });

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
    }

    // Purge complète + re-seed : remet la base dans l'état initial du seed avant chaque test
    public async Task ResetAsync()
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/e2e/reseed");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        var resp = await Client.SendAsync(req);
        resp.EnsureSuccessStatusCode();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await _postgres.DisposeAsync();
        await base.DisposeAsync();
    }
}
