using System.Net;
using InSeconds.Api.Infrastructure.Messaging;
using Microsoft.Extensions.Hosting;

namespace InSeconds.IntegrationTests.Messaging;

/// <summary>
/// En staging et en prod, Wolverine charge le code généré au build (dossier Internal/Generated)
/// au lieu de le compiler au démarrage. Ce test démarre l'API dans ce mode : un endpoint dont le
/// code généré manquerait échouerait ici.
/// </summary>
public class StaticCodegenTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() =>
        _api = new ApiFactory(await postgres.CreateDatabaseAsync(), environment: Environments.Staging);

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public void Staging_UtiliseLeCodeGenere()
    {
        Assert.True(WolverineSetup.UsesStaticCodegen(new HostingEnvironmentStub(Environments.Staging)));
        Assert.True(WolverineSetup.UsesStaticCodegen(new HostingEnvironmentStub(Environments.Production)));
        Assert.False(WolverineSetup.UsesStaticCodegen(new HostingEnvironmentStub("Testing")));
    }

    [Fact]
    public async Task EndpointWolverine_RepondAvecLeCodeGenere()
    {
        var response = await _api.CreateClient(TestUser.Admin)
            .GetAsync("/api/admin/jobs/999", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    private sealed class HostingEnvironmentStub(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "InSeconds.Api";
        public string ContentRootPath { get; set; } = "";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
