using InSeconds.Api.Infrastructure.Persistence;
using Npgsql;

namespace InSeconds.UnitTests.Infrastructure;

public class SearchPathTests
{
    [Fact]
    public void SansSearchPath_AjouteExtensionsApresLeCheminParDefaut()
    {
        var result = DatabaseServiceCollectionExtensions.WithExtensionsSearchPath("Host=db;Database=inseconds");

        Assert.Equal("\"$user\", public, extensions", new NpgsqlConnectionStringBuilder(result).SearchPath);
    }

    [Fact]
    public void ExtensionsDejaPresent_NeLeDoublePas()
    {
        var result = DatabaseServiceCollectionExtensions.WithExtensionsSearchPath("Host=db;Search Path=public,extensions");

        Assert.Equal("public, extensions", new NpgsqlConnectionStringBuilder(result).SearchPath);
    }
}
