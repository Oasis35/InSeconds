using InSeconds.Api.Testing;
using JasperFx.CommandLine;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace InSeconds.IntegrationTests.Testing;

/// <summary>L'hôte de test (<c>InSeconds.Api.Testing</c>), en mémoire, sur une base de test.</summary>
public sealed class TestingFactory(string connectionString, string environment = "Testing")
    : WebApplicationFactory<TestingProgram>
{
    static TestingFactory()
    {
        JasperFxEnvironment.AutoStartHost = true;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.UseSetting("ConnectionStrings:DefaultConnection", connectionString);
        builder.UseSetting("Jobs:Server:Enabled", "false");
    }
}
