using Npgsql;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(InSeconds.IntegrationTests.PostgresFixture))]

namespace InSeconds.IntegrationTests;

/// <summary>
/// Un seul conteneur PostgreSQL (même version majeure que la prod) pour toute la suite, et une base
/// neuve par classe de tests : les classes ne se gênent pas et peuvent tourner en parallèle.
/// </summary>
/// <remarks>
/// Une base neuve est la copie d'une base modèle, préparée une fois par le démarrage d'une API (migrations EF,
/// tables de Wolverine et de Hangfire) : chaque classe démarrait sinon son API sur une base vide et rejouait tout
/// cela, ce qui faisait l'essentiel du temps de la suite une fois le code Wolverine pré-généré.
/// </remarks>
public sealed class PostgresFixture : IAsyncLifetime
{
    private const string TemplateDatabase = "template_inseconds";

    // Chaque API de test ouvre plusieurs pools (EF, Wolverine, Hangfire) sur sa propre base : la
    // limite par défaut (100 connexions) est vite atteinte quand les classes tournent en parallèle.
    // Chaque API de test libère ses pools à sa destruction (ApiFactory.DisposeAsync).
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17-alpine")
        .WithCommand("-c", "max_connections=500")
        .Build();

    public async ValueTask InitializeAsync()
    {
        await _container.StartAsync();
        await ExecuteAsync($"CREATE DATABASE {TemplateDatabase}");
        await using (var api = new ApiFactory(ConnectionStringFor(TemplateDatabase)))
        {
            // Le démarrage applique les migrations ; Wolverine et Hangfire créent leurs tables.
            _ = api.Services;
            // Le nœud Wolverine de cette API (et tout ce qu'il a noté) disparaît avec elle : ses copies ne doivent pas le voir.
            await api.ExecuteAsync("""
                DO $$
                DECLARE t text;
                BEGIN
                    FOR t IN SELECT format('messaging.%I', table_name) FROM information_schema.tables
                             WHERE table_schema = 'messaging' AND table_type = 'BASE TABLE'
                    LOOP
                        EXECUTE 'TRUNCATE ' || t || ' CASCADE';
                    END LOOP;
                END $$
                """);
            // La clé Data Protection créée par cette API, en clair : chaque base fait la sienne (DataProtectionTests).
            await api.ExecuteAsync("TRUNCATE infra.data_protection_keys");
        }
    }

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();

    /// <summary>Une base neuve, déjà migrée, avec les tables de Wolverine et de Hangfire.</summary>
    public Task<string> CreateDatabaseAsync() => CreateAsync($"TEMPLATE {TemplateDatabase}");

    /// <summary>Une base neuve et vide, pour les tests du premier démarrage et des migrations.</summary>
    public Task<string> CreateEmptyDatabaseAsync() => CreateAsync("");

    private async Task<string> CreateAsync(string options)
    {
        var name = $"test_{Guid.NewGuid():N}";
        await ExecuteAsync($"CREATE DATABASE {name} {options}");
        return ConnectionStringFor(name);
    }

    private async Task ExecuteAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(_container.GetConnectionString());
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private string ConnectionStringFor(string database) =>
        new NpgsqlConnectionStringBuilder(_container.GetConnectionString()) { Database = database }.ConnectionString;
}
