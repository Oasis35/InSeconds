using InSeconds.Api.Infrastructure.Persistence;
using Npgsql;

namespace InSeconds.Api.Infrastructure.Settings;

/// <summary>
/// Source de configuration alimentée par <c>infra.settings</c>. Ajoutée en dernier, elle prime sur
/// <c>appsettings.json</c> et les variables d'environnement.
/// </summary>
public sealed class DatabaseSettingsConfigurationSource(string connectionString) : IConfigurationSource
{
    public DatabaseSettingsConfigurationProvider? Provider { get; private set; }

    public IConfigurationProvider Build(IConfigurationBuilder builder)
    {
        Provider = new DatabaseSettingsConfigurationProvider(connectionString);
        return Provider;
    }
}

public sealed class DatabaseSettingsConfigurationProvider(string connectionString) : ConfigurationProvider
{
    // Base, schéma ou table absents : premier démarrage, avant les migrations. Les valeurs par
    // défaut des classes d'options s'appliquent, et la source est relue après la migration.
    private static readonly HashSet<string> NotMigratedYet =
    [
        PostgresErrorCodes.InvalidCatalogName,
        PostgresErrorCodes.InvalidSchemaName,
        PostgresErrorCodes.UndefinedTable,
    ];

    public override void Load()
    {
        var data = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var connection = new NpgsqlConnection(connectionString);
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = $"SELECT key, value::text FROM {DbSchemas.Infra}.settings";
            using var reader = command.ExecuteReader();
            while (reader.Read())
                SettingsJsonFlattener.Flatten(reader.GetString(0), reader.GetString(1), data);
        }
        catch (PostgresException ex) when (NotMigratedYet.Contains(ex.SqlState))
        {
            // Rien à lire pour l'instant. Toute autre erreur (base injoignable, droits) remonte :
            // mieux vaut refuser de démarrer que tourner avec des réglages faux.
        }

        Data = data;
    }

    /// <summary>Relit la table et prévient les <c>IOptionsMonitor</c>.</summary>
    public void Reload()
    {
        Load();
        OnReload();
    }
}
