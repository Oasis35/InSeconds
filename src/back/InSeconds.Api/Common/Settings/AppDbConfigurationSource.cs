using Microsoft.Extensions.Configuration;
using Npgsql;

namespace InSeconds.Api.Common.Settings;

public sealed class AppDbConfigurationSource(string connectionString) : IConfigurationSource
{
    public IConfigurationProvider Build(IConfigurationBuilder builder)
        => new AppDbConfigurationProvider(connectionString);
}

public sealed class AppDbConfigurationProvider(string connectionString) : ConfigurationProvider
{
    public const string SectionPrefix = "AppDb";

    public override void Load()
    {
        var data = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var conn = new NpgsqlConnection(connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT \"Key\", \"Value\" FROM \"Settings\"";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
                data[$"{SectionPrefix}:{reader.GetString(0)}"] = reader.GetString(1);
        }
        catch
        {
            // DB absente au boot (tests, première migration) → dict vide → defaults des propriétés
        }
        Data = data;
    }
}
