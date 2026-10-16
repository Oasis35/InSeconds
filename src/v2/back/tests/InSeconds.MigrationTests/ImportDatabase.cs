using InSeconds.Api.Infrastructure.Hosting;
using Npgsql;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(InSeconds.MigrationTests.ImportDatabase))]

namespace InSeconds.MigrationTests;

/// <summary>
/// Un conteneur PostgreSQL (même version majeure que la prod) avec les scripts de
/// <c>deploy/migration-v2</c> copiés dans <c>/import</c>, et une base neuve par test : schéma v1
/// (<c>v1-schema.sql</c>, généré depuis le code v1 juste avant sa suppression en I2 : la v1 ne change plus),
/// puis migrations v2 (<c>--migrate-only</c>, comme à la bascule).
/// </summary>
public sealed class ImportDatabase : IAsyncLifetime
{
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
        // Sans réserve de connexions : une base par test, et chaque réserve garderait ses connexions ouvertes (le serveur en refuse plus de cent).
        var connectionString = new NpgsqlConnectionStringBuilder(_container.GetConnectionString()) { Database = name, Pooling = false }.ConnectionString;

        await ExecuteAsync(connectionString, _v1Schema);
        Assert.Equal(0, await MigrateOnlyCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={connectionString}"]));
        return connectionString;
    }

    /// <summary>Lance le vrai <c>run-import.sh</c>, dans le conteneur (POSIX sh et psql de l'image Alpine), avec ses options (<c>--force</c>).</summary>
    public Task<ImportResult> RunImportAsync(string connectionString, params string[] options) =>
        RunInContainerAsync(connectionString, $"sh {ImportDirectory}/run-import.sh {string.Join(' ', options)}");

    /// <summary>
    /// Lance un script SQL du dossier par psql, dans le conteneur, comme le mode d'emploi (<c>mark-opened.sql</c>, <c>30-verify-day-stats.sql</c>),
    /// avec ses variables psql (<c>keep=adresse</c> pour <c>staging-anonymize.sql</c> ; valeurs sans espace ni apostrophe).
    /// </summary>
    public Task<ImportResult> RunSqlFileAsync(string connectionString, string fileName, params string[] variables) =>
        RunInContainerAsync(connectionString,
            $"psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 {string.Concat(variables.Select(v => $"-v '{v}' "))}-f {ImportDirectory}/{fileName}");

    private async Task<ImportResult> RunInContainerAsync(string connectionString, string command)
    {
        var database = new NpgsqlConnectionStringBuilder(connectionString).Database;
        var result = await _container.ExecAsync(
        [
            "sh", "-c",
            $"PGHOST=localhost PGUSER={PostgreSqlBuilder.DefaultUsername} PGPASSWORD={PostgreSqlBuilder.DefaultPassword} PGDATABASE={database} {command}",
        ]);
        // Pas de code de sortie : la commande ne s'est pas terminée normalement.
        return new ImportResult(result.ExitCode ?? -1, result.Stdout + result.Stderr);
    }

    /// <summary>Même enchaînement que run-import.sh, avec un écart glissé entre l'import et la vérification : la vérification doit le refuser.</summary>
    public static async Task<PostgresException> ImportWithTamperingAsync(string connectionString, string tamperingSql)
    {
        var directory = Path.Combine(RepositoryRoot, "deploy", "migration-v2");
        var script = string.Join("\n",
            File.ReadAllText(Path.Combine(directory, "00-import-state.sql")),
            File.ReadAllText(Path.Combine(directory, "05-check-source.sql")),
            File.ReadAllText(Path.Combine(directory, "10-import.sql")),
            tamperingSql,
            File.ReadAllText(Path.Combine(directory, "20-verify.sql")));
        return await Assert.ThrowsAsync<PostgresException>(() => ExecuteAsync(connectionString, $"BEGIN;\n{script}\nCOMMIT;"));
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

    /// <summary>Le schéma v1, copié à côté des tests (<c>v1-schema.sql</c>).</summary>
    private static Task<string> LoadV1SchemaAsync() =>
        File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "v1-schema.sql"));

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
