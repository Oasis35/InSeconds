using JasperFx.CommandLine;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.MigrationTests;

/// <summary>L'API v2 complète, en mémoire, sur la base importée.</summary>
internal sealed class V2Api(string connectionString, TimeProvider time, IReadOnlyDictionary<string, string>? settings = null)
    : WebApplicationFactory<Program>
{
    static V2Api()
    {
        // Program.cs se termine par RunJasperFxCommands : l'hôte doit être démarré par la commande.
        JasperFxEnvironment.AutoStartHost = true;
    }

    public async Task<HttpResponseMessage> GetMeAsync(string cookie)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return await client.GetAsync("/api/players/me", TestContext.Current.CancellationToken);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", connectionString);
        builder.UseSetting("Jobs:Server:Enabled", "false");
        foreach (var (key, value) in settings ?? new Dictionary<string, string>())
            builder.UseSetting(key, value);
        builder.ConfigureTestServices(services => services.AddSingleton(time));
    }
}
