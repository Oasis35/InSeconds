using JasperFx.CommandLine;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace InSeconds.IntegrationTests;

/// <summary>L'API complète, en mémoire, sur une base de test.</summary>
public sealed class ApiFactory(
    string connectionString,
    Action<IServiceCollection>? configureServices = null,
    IReadOnlyDictionary<string, string>? settings = null,
    string environment = "Testing")
    : WebApplicationFactory<Program>
{
    static ApiFactory()
    {
        // Program.cs se termine par RunJasperFxCommands : sous WebApplicationFactory, l'hôte doit
        // être démarré par la commande, sinon le serveur de test ne reçoit jamais l'application.
        JasperFxEnvironment.AutoStartHost = true;
    }

    public string ConnectionString => connectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.UseSetting("ConnectionStrings:DefaultConnection", connectionString);
        // Les tests d'intégration appellent les tâches directement : pas de serveur Hangfire (§ 5.4 bis).
        builder.UseSetting("Jobs:Server:Enabled", "false");
        // Les politiques restent sur les routes, mais ne limitent rien (RateLimitingTests les active).
        builder.UseSetting("RateLimiting:Enabled", "false");
        foreach (var (key, value) in settings ?? new Dictionary<string, string>())
            builder.UseSetting(key, value);

        builder.ConfigureTestServices(services =>
        {
            services.AddTestAuthentication();
            configureServices?.Invoke(services);
        });
    }

    /// <summary>Client HTTP authentifié comme un joueur (voir <see cref="TestAuthHandler"/>).</summary>
    public HttpClient CreateClient(TestUser user)
    {
        var client = CreateClient();
        user.Apply(client);
        return client;
    }

    public async Task<T?> ScalarAsync<T>(string sql)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        var value = await command.ExecuteScalarAsync();
        return value is null or DBNull ? default : (T)value;
    }
}
