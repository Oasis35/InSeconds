using InSeconds.Api.Infrastructure.Hosting;
using Npgsql;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(InSeconds.MigrationTests.ScriptDatabase))]

namespace InSeconds.MigrationTests;

/// <summary>
/// Un conteneur PostgreSQL (même version majeure que la prod) avec les scripts SQL de <c>deploy/vps</c> copiés dans
/// <c>/scripts</c>, et une base neuve par test, migrée comme au déploiement (<c>--migrate-only</c>).
/// </summary>
public sealed class ScriptDatabase : IAsyncLifetime
{
    private const string ScriptDirectory = "/scripts";

    private readonly PostgreSqlContainer _container;

    public ScriptDatabase()
    {
        var builder = new PostgreSqlBuilder("postgres:17-alpine");
        // Fins de ligne Unix : un checkout Windows (autocrlf) donnerait des scripts que psql lit mal.
        foreach (var file in Directory.GetFiles(Path.Combine(RepositoryRoot, "deploy", "vps"), "*.sql"))
            builder = builder.WithResourceMapping(
                System.Text.Encoding.UTF8.GetBytes(File.ReadAllText(file).Replace("\r\n", "\n", StringComparison.Ordinal)),
                $"{ScriptDirectory}/{Path.GetFileName(file)}");
        _container = builder.Build();
    }

    public static string RepositoryRoot { get; } = FindRepositoryRoot();

    public async ValueTask InitializeAsync() => await _container.StartAsync();

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();

    /// <summary>Une base neuve avec les schémas des modules migrés.</summary>
    public async Task<string> CreateDatabaseAsync()
    {
        var name = $"scripts_{Guid.NewGuid():N}";
        await ExecuteAsync(_container.GetConnectionString(), $"CREATE DATABASE {name}");
        // Sans réserve de connexions : une base par test, et chaque réserve garderait ses connexions ouvertes (le serveur en refuse plus de cent).
        var connectionString = new NpgsqlConnectionStringBuilder(_container.GetConnectionString()) { Database = name, Pooling = false }.ConnectionString;

        Assert.Equal(0, await MigrateOnlyCommand.RunAsync([$"--ConnectionStrings:DefaultConnection={connectionString}"]));
        return connectionString;
    }

    /// <summary>Un joueur, avec un compte si <paramref name="email"/> est donné (pseudo de 3 à 20 caractères).</summary>
    public static async Task<Guid> InsertPlayerAsync(string connectionString, string? email = null, string? pseudo = null, bool isAdmin = false)
    {
        var id = Guid.NewGuid();
        await ExecuteAsync(connectionString, $"INSERT INTO players.players (id, created_at) VALUES ('{id}', now())");
        if (email is not null)
            await ExecuteAsync(connectionString, $"""
                INSERT INTO players.accounts (player_id, email, pseudo, is_admin, linked_at) VALUES ('{id}', '{email}', '{pseudo}', {isAdmin}, now())
                """);
        return id;
    }

    /// <summary>Lance un script SQL de <c>deploy/vps</c> par psql, dans le conteneur, avec ses variables psql (valeurs sans espace ni apostrophe).</summary>
    public async Task<ScriptResult> RunSqlFileAsync(string connectionString, string fileName, params string[] variables)
    {
        var database = new NpgsqlConnectionStringBuilder(connectionString).Database;
        var result = await _container.ExecAsync(
        [
            "sh", "-c",
            $"PGHOST=localhost PGUSER={PostgreSqlBuilder.DefaultUsername} PGPASSWORD={PostgreSqlBuilder.DefaultPassword} PGDATABASE={database} "
            + $"psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 {string.Concat(variables.Select(v => $"-v '{v}' "))}-f {ScriptDirectory}/{fileName}",
        ]);
        // Pas de code de sortie : la commande ne s'est pas terminée normalement.
        return new ScriptResult(result.ExitCode ?? -1, result.Stdout + result.Stderr);
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

    private static string FindRepositoryRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "deploy", "vps", "staging-anonymize.sql")))
                return dir.FullName;
        throw new InvalidOperationException("Racine du dépôt introuvable (deploy/vps/staging-anonymize.sql).");
    }
}

/// <param name="Output">Sortie standard et erreurs de psql.</param>
public sealed record ScriptResult(long ExitCode, string Output);
