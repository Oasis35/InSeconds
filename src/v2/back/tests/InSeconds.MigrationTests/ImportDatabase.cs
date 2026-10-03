using System.Diagnostics;
using InSeconds.Api.Infrastructure.Hosting;
using Npgsql;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(InSeconds.MigrationTests.ImportDatabase))]

namespace InSeconds.MigrationTests;

/// <summary>
/// Un conteneur PostgreSQL (même version majeure que la prod) avec les scripts de
/// <c>deploy/migration-v2</c> copiés dans <c>/import</c>, et une base neuve par test : schéma v1
/// (script généré depuis le code v1, jamais une copie figée qui dériverait), puis migrations v2
/// (<c>--migrate-only</c>, comme à la bascule).
/// </summary>
public sealed class ImportDatabase : IAsyncLifetime
{
    /// <summary>Script SQL du schéma v1 déjà généré (CI) ; sans lui, il est généré au démarrage des tests.</summary>
    public const string V1SchemaVariable = "INSECONDS_V1_SCHEMA_SQL";

    private const string ImportDirectory = "/import";

    private readonly PostgreSqlContainer _container;
    private string _v1Schema = null!;

    public ImportDatabase()
    {
        var builder = new PostgreSqlBuilder("postgres:17-alpine");
        // Fins de ligne Unix : un checkout Windows (autocrlf) donnerait des scripts que sh refuse.
        foreach (var file in Directory.GetFiles(Path.Combine(RepositoryRoot, "deploy", "migration-v2")))
            builder = builder.WithResourceMapping(
                System.Text.Encoding.UTF8.GetBytes(File.ReadAllText(file).Replace("\r\n", "\n", StringComparison.Ordinal)),
                $"{ImportDirectory}/{Path.GetFileName(file)}");
        _container = builder.Build();
    }

    public static string RepositoryRoot { get; } = FindRepositoryRoot();

    public async ValueTask InitializeAsync()
    {
        var schemaTask = LoadV1SchemaAsync();
        await _container.StartAsync();
        _v1Schema = await schemaTask;
    }

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();

    /// <summary>Une base de forme v1, vide, avec les schémas v2 déjà migrés.</summary>
    public async Task<string> CreateDatabaseAsync()
    {
        var name = $"import_{Guid.NewGuid():N}";
        await ExecuteAsync(_container.GetConnectionString(), $"CREATE DATABASE {name}");
        var connectionString = new NpgsqlConnectionStringBuilder(_container.GetConnectionString()) { Database = name }.ConnectionString;

        await ExecuteAsync(connectionString, _v1Schema);
        Assert.Equal(0, await MigrateOnlyCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={connectionString}"]));
        return connectionString;
    }

    /// <summary>Lance le vrai <c>run-import.sh</c>, dans le conteneur (POSIX sh et psql de l'image Alpine).</summary>
    public async Task<ImportResult> RunImportAsync(string connectionString)
    {
        var database = new NpgsqlConnectionStringBuilder(connectionString).Database;
        var result = await _container.ExecAsync(
        [
            "sh", "-c",
            $"PGHOST=localhost PGUSER={PostgreSqlBuilder.DefaultUsername} PGPASSWORD={PostgreSqlBuilder.DefaultPassword} PGDATABASE={database} sh {ImportDirectory}/run-import.sh",
        ]);
        // Pas de code de sortie : la commande ne s'est pas terminée normalement.
        return new ImportResult(result.ExitCode ?? -1, result.Stdout + result.Stderr);
    }

    public static async Task ExecuteAsync(string connectionString, string sql)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    public static async Task<T?> ScalarAsync<T>(string connectionString, string sql)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        var value = await command.ExecuteScalarAsync();
        return value is null or DBNull ? default : (T)value;
    }

    private static async Task<string> LoadV1SchemaAsync()
    {
        if (Environment.GetEnvironmentVariable(V1SchemaVariable) is { Length: > 0 } path)
            return await File.ReadAllTextAsync(path);

        // Le projet v1 n'est pas restauré par la solution v2 : sans restauration, dotnet ef ne lit pas ses métadonnées.
        var v1Project = Path.Combine(RepositoryRoot, "src", "back", "InSeconds.Api", "InSeconds.Api.csproj");
        var output = Path.Combine(Path.GetTempPath(), $"inseconds-v1-schema-{Guid.NewGuid():N}.sql");
        await RunDotnetAsync(["restore", v1Project]);
        await RunDotnetAsync(["ef", "migrations", "script", "--project", v1Project, "--output", output]);

        try
        {
            return await File.ReadAllTextAsync(output);
        }
        finally
        {
            File.Delete(output);
        }
    }

    /// <summary>Une commande dotnet sur le code v1 (son global.json, depuis src/back).</summary>
    private static async Task RunDotnetAsync(string[] arguments)
    {
        var start = new ProcessStartInfo("dotnet", arguments)
        {
            WorkingDirectory = Path.Combine(RepositoryRoot, "src", "back"),
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0)
            throw new InvalidOperationException(
                $"Génération du schéma v1 en échec (dotnet {string.Join(' ', arguments)}) :{Environment.NewLine}{await stdout}{await stderr}");
    }

    private static string FindRepositoryRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (Directory.Exists(Path.Combine(dir.FullName, "deploy", "migration-v2")))
                return dir.FullName;
        throw new InvalidOperationException("Racine du dépôt introuvable (dossier deploy/migration-v2).");
    }
}

/// <param name="Output">Sortie standard et erreurs de psql.</param>
public sealed record ImportResult(long ExitCode, string Output);
