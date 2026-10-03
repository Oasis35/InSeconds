using Microsoft.Extensions.Options;

namespace InSeconds.IntegrationTests.Security;

/// <summary>Les emails ne partent jamais vers un vrai joueur depuis le staging (sa base copie la prod).</summary>
public class EmailStartupTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Staging_SansRedirection_RefuseDeDemarrer()
    {
        await using var api = new ApiFactory(_connectionString,
            settings: new Dictionary<string, string>(TestCertificate.Settings()) { ["Brevo:ApiKey"] = "clé" }, environment: "Staging");

        var exception = Assert.ThrowsAny<Exception>(() => api.Server);

        Assert.Contains("EmailRedirect:To", Flatten(exception));
    }

    [Fact]
    public async Task Production_SansCleBrevo_RefuseDeDemarrer()
    {
        await using var api = new ApiFactory(_connectionString, settings: TestCertificate.Settings(), environment: "Production");

        var exception = Assert.ThrowsAny<Exception>(() => api.Server);

        Assert.Contains(Unwrap(exception), e => e is OptionsValidationException);
    }

    private static IEnumerable<Exception> Unwrap(Exception exception)
    {
        for (Exception? e = exception; e is not null; e = e.InnerException)
        {
            yield return e;
            if (e is AggregateException aggregate)
                foreach (var inner in aggregate.InnerExceptions.SelectMany(Unwrap))
                    yield return inner;
        }
    }

    private static string Flatten(Exception exception) => string.Join(" | ", Unwrap(exception).Select(e => e.Message));
}
