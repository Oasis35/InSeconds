using System.Reflection;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace InSeconds.IntegrationTests;

public class MigrateOnlyTests(PostgresFixture postgres)
{
    private static readonly long MigrationCount = typeof(InSecondsDbContext).Assembly.GetTypes()
        .LongCount(type => type.GetCustomAttribute<MigrationAttribute>() is not null);

    [Fact]
    public async Task MigrateOnly_AppliqueLesMigrationsPuisRendLaMain()
    {
        var connectionString = await postgres.CreateDatabaseAsync();

        // Rend la main : aucun serveur HTTP ni service hébergé n'a démarré (sinon l'appel bloquerait).
        var exitCode = await MigrateOnlyCommand.RunAsync(
            [MigrateOnlyCommand.Flag, $"--ConnectionStrings:DefaultConnection={connectionString}"],
            TestContext.Current.CancellationToken);

        Assert.Equal(0, exitCode);
        Assert.Equal(MigrationCount, await CountAsync(connectionString, "SELECT count(*) FROM infra.__ef_migrations_history"));
        Assert.Equal(0L, await CountAsync(connectionString, "SELECT count(*) FROM infra.settings"));
        // Ni Wolverine ni Hangfire n'ont démarré : ils créent leurs schémas au démarrage de l'API (E3).
        Assert.Equal(0L, await CountAsync(connectionString,
            "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('messaging', 'jobs')"));
    }

    [Fact]
    public async Task MigrateOnly_RejoueSansEffet()
    {
        var connectionString = await postgres.CreateDatabaseAsync();
        string[] args = [MigrateOnlyCommand.Flag, $"--ConnectionStrings:DefaultConnection={connectionString}"];

        await MigrateOnlyCommand.RunAsync(args, TestContext.Current.CancellationToken);
        var exitCode = await MigrateOnlyCommand.RunAsync(args, TestContext.Current.CancellationToken);

        Assert.Equal(0, exitCode);
        Assert.Equal(MigrationCount, await CountAsync(connectionString, "SELECT count(*) FROM infra.__ef_migrations_history"));
    }

    private static async Task<long> CountAsync(string connectionString, string sql)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        return (long)(await command.ExecuteScalarAsync())!;
    }
}
