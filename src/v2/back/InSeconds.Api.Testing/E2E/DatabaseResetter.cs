using InSeconds.Api.Infrastructure.Persistence;
using Npgsql;
using Respawn;

namespace InSeconds.Api.Testing.E2E;

/// <summary>
/// Vide les tables des modules entre deux tests E2E. Ne touche jamais <c>public</c> (tables v1, qui
/// partagent la base jusqu'à la bascule), ni les schémas techniques (settings, migrations, messages
/// Wolverine, tâches Hangfire) : la liste des schémas est lue en base à chaque appel, donc un
/// nouveau module est vidé sans rien changer ici.
/// </summary>
public sealed class DatabaseResetter(IConfiguration configuration)
{
    internal static readonly string[] PreservedSchemas =
        ["public", DbSchemas.Infra, DbSchemas.Extensions, DbSchemas.Messaging, DbSchemas.Jobs];

    public async Task<IReadOnlyList<string>> ResetAsync(CancellationToken ct)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(ct);

        var schemas = await ModuleSchemasAsync(connection, ct);
        // Sans schéma à inclure, Respawn viderait toute la base : on ne l'appelle pas.
        if (schemas.Count == 0)
            return schemas;

        var respawner = await Respawner.CreateAsync(connection, new RespawnerOptions
        {
            DbAdapter = DbAdapter.Postgres,
            SchemasToInclude = [.. schemas],
        });
        await respawner.ResetAsync(connection);
        return schemas;
    }

    private static async Task<List<string>> ModuleSchemasAsync(NpgsqlConnection connection, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand(
            """
            SELECT schema_name FROM information_schema.schemata
            WHERE schema_name NOT LIKE 'pg\_%' AND schema_name <> 'information_schema'
              AND NOT (schema_name = ANY(@preserved))
            ORDER BY schema_name
            """, connection);
        command.Parameters.AddWithValue("preserved", PreservedSchemas);

        var schemas = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            schemas.Add(reader.GetString(0));
        return schemas;
    }
}
