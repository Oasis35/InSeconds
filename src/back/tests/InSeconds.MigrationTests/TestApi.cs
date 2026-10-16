using JasperFx.CommandLine;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace InSeconds.MigrationTests;

/// <summary>L'API complète, en mémoire, sur une base de test (pour que Wolverine y crée ses tables au démarrage).</summary>
internal sealed class TestApi(string connectionString) : WebApplicationFactory<Program>
{
    static TestApi()
    {
        // Program.cs se termine par RunJasperFxCommands : l'hôte doit être démarré par la commande.
        JasperFxEnvironment.AutoStartHost = true;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", connectionString);
        builder.UseSetting("Jobs:Server:Enabled", "false");
    }
}
