using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Testing.Deezer;
using InSeconds.Api.Testing.E2E;
using InSeconds.Api.Testing.Email;
using InSeconds.Infrastructure.Email;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace InSeconds.IntegrationTests.Testing;

public class TestingHostTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;
    private TestingFactory _host = null!;

    public async ValueTask InitializeAsync()
    {
        _connectionString = await postgres.CreateDatabaseAsync();
        _host = new TestingFactory(_connectionString);
    }

    public ValueTask DisposeAsync() => _host.DisposeAsync();

    [Fact]
    public async Task Reset_VideLesSchemasDesModules_JamaisPublicNiLesTablesTechniques()
    {
        var client = _host.CreateClient();
        // Démarre l'hôte (migrations), puis simule un module et une table v1.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health", TestContext.Current.CancellationToken)).StatusCode);
        await ExecuteAsync("""
            CREATE SCHEMA module_test; CREATE TABLE module_test.items (id int primary key); INSERT INTO module_test.items VALUES (1);
            CREATE TABLE public."Players" (id int primary key); INSERT INTO public."Players" VALUES (1);
            """);
        var settingsBefore = await CountAsync("infra.settings");
        var migrationsBefore = await CountAsync("infra.__ef_migrations_history");

        var response = await client.PostAsync("/api/e2e/reset", null, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reset = await response.Content.ReadFromJsonAsync<ResetResponse>(TestContext.Current.CancellationToken);
        Assert.Equal(["catalogue", "daily", "module_test", "players"], reset!.Schemas);
        Assert.Equal(0, await CountAsync("module_test.items"));
        Assert.Equal(1, await CountAsync("public.\"Players\""));
        Assert.Equal(settingsBefore, await CountAsync("infra.settings"));
        Assert.Equal(migrationsBefore, await CountAsync("infra.__ef_migrations_history"));
    }

    [Fact]
    public async Task Reset_VideLeModulePlayers_SansToucherAuxTablesV1()
    {
        var client = _host.CreateClient();
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsync("/api/players/guest", null, TestContext.Current.CancellationToken)).StatusCode);
        await ExecuteAsync("""CREATE TABLE public."Players" (id int primary key); INSERT INTO public."Players" VALUES (1);""");

        var response = await client.PostAsync("/api/e2e/reset", null, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, await CountAsync("players.players"));
        Assert.Equal(0, await CountAsync("players.device_sessions"));
        Assert.Equal(1, await CountAsync("public.\"Players\""));
    }

    [Fact]
    public async Task LesEmailsSontCaptures_LisiblesParLastEmail_EtVidesParReset()
    {
        var client = _host.CreateClient();
        var sender = _host.Services.GetRequiredService<IEmailSender>();
        Assert.IsType<CapturingEmailSender>(sender);

        await sender.SendAsync("Joueur@Example.com", "Premier", "<p>1</p>", TestContext.Current.CancellationToken);
        await sender.SendAsync("joueur@example.com", "Second", "<p>2</p>", TestContext.Current.CancellationToken);

        var email = await client.GetFromJsonAsync<CapturedEmail>("/api/e2e/last-email?to=joueur@example.com", TestContext.Current.CancellationToken);
        Assert.Equal("Second", email!.Subject);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/api/e2e/last-email?to=autre@example.com", TestContext.Current.CancellationToken)).StatusCode);

        await client.PostAsync("/api/e2e/reset", null, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/api/e2e/last-email?to=joueur@example.com", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task SeedCatalogue_AjouteLePoolDeTest_UneSeuleFois_ResetLeVide()
    {
        var client = _host.CreateClient();

        var first = await client.PostAsync("/api/e2e/seed-catalogue", null, TestContext.Current.CancellationToken);
        var second = await client.PostAsync("/api/e2e/seed-catalogue", null, TestContext.Current.CancellationToken);

        Assert.Equal(55, (await first.Content.ReadFromJsonAsync<SeedResponse>(TestContext.Current.CancellationToken))!.Added);
        Assert.Equal(0, (await second.Content.ReadFromJsonAsync<SeedResponse>(TestContext.Current.CancellationToken))!.Added);
        Assert.Equal(55, await CountAsync("catalogue.tracks"));
        // 50 jouables et 5 sans extrait, comme le pool de test de la v1.
        Assert.Equal(50, await CountAsync("catalogue.tracks WHERE preview_status = 1"));
        Assert.Equal(5, await CountAsync("catalogue.tracks WHERE preview_status = 2 AND deezer_track_id >= 9000000000"));

        await client.PostAsync("/api/e2e/reset", null, TestContext.Current.CancellationToken);
        Assert.Equal(0, await CountAsync("catalogue.tracks"));
    }

    [Fact]
    public async Task Reset_RemetLeFauxDeezerEtSonCacheAZero()
    {
        var client = _host.CreateClient();
        var deezer = _host.Services.GetRequiredService<FakeDeezerState>();
        await client.GetAsync("/api/catalogue/search?q=daft-punk", TestContext.Current.CancellationToken);
        await client.GetAsync("/api/catalogue/search?q=daft-punk", TestContext.Current.CancellationToken);
        // La seconde recherche est servie par le cache : une seule requête est partie chez Deezer.
        Assert.Single(deezer.Requests);
        deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(new HttpResponseMessage(HttpStatusCode.InternalServerError));

        await client.PostAsync("/api/e2e/reset", null, TestContext.Current.CancellationToken);

        Assert.Empty(deezer.Requests);
        Assert.Null(deezer.Intercept);
        // Le cache est vidé aussi : la même recherche repart chez Deezer.
        await client.GetAsync("/api/catalogue/search?q=daft-punk", TestContext.Current.CancellationToken);
        Assert.Single(deezer.Requests);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task HorsTestingEtDevelopment_RefuseDeDemarrer(string environment)
    {
        await using var host = new TestingFactory(_connectionString, environment);

        var exception = Assert.ThrowsAny<Exception>(() => host.Server);

        Assert.Contains("hôte de test", Flatten(exception));
    }

    private static string Flatten(Exception exception)
    {
        var messages = new List<string>();
        for (Exception? e = exception; e is not null; e = e.InnerException)
            messages.Add(e.Message);
        return string.Join(" | ", messages);
    }

    private async Task ExecuteAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
    }

    private async Task<long> CountAsync(string table)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand($"SELECT count(*) FROM {table}", connection);
        return (long)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
    }
}
