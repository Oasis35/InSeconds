using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;
using JasperFx.CommandLine;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.MigrationTests;

/// <summary>
/// Test de bout en bout du cookie v1 (§ 8.6 du plan v2) : un cookie émis par la v1, avec ses clés et
/// ses paramètres Data Protection, est accepté par la v2 après import, donne le même joueur et est
/// remplacé par le cookie standard. Le même cookie présenté par deux navigateurs donne deux appareils
/// du même joueur, sans déconnexion (R1).
/// </summary>
public class LegacyCookieEndToEndTests(ImportDatabase database)
{
    [Fact]
    public async Task CookieV1_AcceptéAprèsImport_MêmeJoueur_DeuxNavigateursDeuxAppareils()
    {
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Account("fidele@example.com", "Fidele") with { IsAdmin = true };
        await V1Data.InsertAsync(cs, player);
        // Le navigateur du joueur porte le cookie que la v1 lui a donné, chiffré avec les clés de la v1.
        var v1Cookie = $"authToken={V1Protector(cs).Protect(player.AuthToken.ToString())}";

        var import = await database.RunImportAsync(cs);
        Assert.True(import.ExitCode == 0, import.Output);

        var time = new FakeTimeProvider(DateTimeOffset.UtcNow);
        await using var api = new V2Api(cs, time);
        var firstBrowser = await api.GetMeAsync(v1Cookie);
        // Un même cookie converti dans la minute retrouve sa session (requêtes parallèles d'un premier
        // chargement, LegacyConversionCache) : le second navigateur arrive plus tard.
        time.Advance(TimeSpan.FromMinutes(2));
        var secondBrowser = await api.GetMeAsync(v1Cookie);

        foreach (var response in new[] { firstBrowser, secondBrowser })
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(new PlayerMeResponse(player.Id, IsGuest: false, "fidele@example.com", "Fidele", IsAdmin: true),
                await response.Content.ReadFromJsonAsync<PlayerMeResponse>(TestContext.Current.CancellationToken));
            Assert.Contains(SetCookies(response), c => c.StartsWith("authToken=;", StringComparison.Ordinal));
        }

        Assert.Equal(2L, await ImportDatabase.ScalarAsync<long>(cs,
            $"SELECT count(*) FROM players.device_sessions WHERE player_id = '{player.Id}' AND revoked_at IS NULL"));
        // Le nouveau cookie standard suffit ensuite, sans l'ancien.
        var v2Cookie = SetCookies(firstBrowser).Single(c => c.StartsWith("inseconds=", StringComparison.Ordinal)).Split(';')[0];
        var next = await api.GetMeAsync(v2Cookie);
        Assert.Equal(player.Id, (await next.Content.ReadFromJsonAsync<PlayerMeResponse>(TestContext.Current.CancellationToken))!.PlayerId);
    }

    /// <summary>Data Protection configuré comme la v1 (<c>Program.cs</c> v1), sur sa table <c>public."DataProtectionKeys"</c>.</summary>
    private static IDataProtector V1Protector(string connectionString)
    {
        var services = new ServiceCollection();
        services.AddDbContext<V1KeysContext>(options => options.UseNpgsql(connectionString));
        services.AddDataProtection().SetApplicationName("InSeconds").PersistKeysToDbContext<V1KeysContext>();
        return services.BuildServiceProvider().GetDataProtector("InSeconds.Auth.Cookie");
    }

    private static IEnumerable<string> SetCookies(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var values) ? values : [];

    /// <summary>La table des clés de la v1, nommée par EF sans convention (« DataProtectionKeys », colonnes en PascalCase).</summary>
    private sealed class V1KeysContext(DbContextOptions<V1KeysContext> options) : DbContext(options), IDataProtectionKeyContext
    {
        public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();
    }

    /// <summary>L'API v2 complète, en mémoire, sur la base importée.</summary>
    private sealed class V2Api(string connectionString, TimeProvider time) : WebApplicationFactory<Program>
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
            builder.ConfigureTestServices(services => services.AddSingleton(time));
        }
    }
}
