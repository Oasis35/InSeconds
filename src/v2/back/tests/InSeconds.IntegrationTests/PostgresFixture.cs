using Npgsql;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(InSeconds.IntegrationTests.PostgresFixture))]

namespace InSeconds.IntegrationTests;

/// <summary>
/// Un seul conteneur PostgreSQL (même version majeure que la prod) pour toute la suite, et une base
/// neuve par classe de tests : les classes ne se gênent pas et peuvent tourner en parallèle.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public async ValueTask InitializeAsync() => await _container.StartAsync();

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();

    public async Task<string> CreateDatabaseAsync()
    {
        var name = $"test_{Guid.NewGuid():N}";
        await using (var connection = new NpgsqlConnection(_container.GetConnectionString()))
        {
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand($"CREATE DATABASE {name}", connection);
            await command.ExecuteNonQueryAsync();
        }

        return new NpgsqlConnectionStringBuilder(_container.GetConnectionString()) { Database = name }.ConnectionString;
    }
}
