using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Modules.Players.Application;
using JasperFx.CommandLine;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
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

    [Fact]
    public async Task ApresImport_UneCleNeuveChiffreeParLeCertificat_DevientLaCleParDefaut_LeCookieV1RestePris()
    {
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Account("cle@example.com", "Cle");
        await V1Data.InsertAsync(cs, player);
        var v1Cookie = $"authToken={V1Protector(cs).Protect(player.AuthToken.ToString())}";
        Assert.True((await database.RunImportAsync(cs)).ExitCode == 0);
        var lastV1KeyId = await ImportDatabase.ScalarAsync<int>(cs, "SELECT max(id) FROM infra.data_protection_keys");

        Assert.Equal(0, await RotateDataProtectionKeyCommand.RunAsync(
            [$"--ConnectionStrings:DefaultConnection={cs}", .. TestCertificate.Arguments()]));

        await using var api = new V2Api(cs, new FakeTimeProvider(DateTimeOffset.UtcNow), TestCertificate.Settings());
        var defaultKey = await DefaultKeyAsync(api, cs);
        // S16 : la clé qui chiffre les nouveaux cookies est la clé neuve, protégée par le certificat...
        Assert.True(defaultKey.Id > lastV1KeyId, "la clé par défaut est une clé de la v1");
        Assert.Contains("encryptedSecret", defaultKey.Xml, StringComparison.Ordinal);
        // ...les clés de la v1 restent, en clair, pour relire les anciens cookies.
        Assert.Equal(1L, await ImportDatabase.ScalarAsync<long>(cs,
            $"SELECT count(*) FROM infra.data_protection_keys WHERE id <= {lastV1KeyId} AND xml NOT LIKE '%encryptedSecret%'"));
        var response = await api.GetMeAsync(v1Cookie);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(player.Id, (await response.Content.ReadFromJsonAsync<PlayerMeResponse>(TestContext.Current.CancellationToken))!.PlayerId);
    }

    [Fact]
    public async Task SansRotation_LaCleDeLaV1EnClair_RestaitLaCleParDefaut()
    {
        // Le risque que la commande écarte : l'import copie les clés de la v1, en clair ; sans clé neuve, la
        // plus récente d'entre elles chiffrerait les nouveaux cookies de la v2.
        var cs = await database.CreateDatabaseAsync();
        var player = V1Player.Account("sans-rotation@example.com", "SansRotation");
        await V1Data.InsertAsync(cs, player);
        _ = V1Protector(cs).Protect(player.AuthToken.ToString());
        Assert.True((await database.RunImportAsync(cs)).ExitCode == 0);

        await using var api = new V2Api(cs, new FakeTimeProvider(DateTimeOffset.UtcNow), TestCertificate.Settings());
        var defaultKey = await DefaultKeyAsync(api, cs);

        Assert.DoesNotContain("encryptedSecret", defaultKey.Xml, StringComparison.Ordinal);
    }

    /// <summary>
    /// La clé qui chiffre les nouvelles données de l'API : son identifiant se lit dans l'en-tête de ce
    /// qu'elle protège (4 octets de repère, puis l'identifiant de la clé sur 16 octets).
    /// </summary>
    private static async Task<(int Id, string Xml)> DefaultKeyAsync(V2Api api, string connectionString)
    {
        var protector = api.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector("test");
        var keyId = new Guid(WebEncoders.Base64UrlDecode(protector.Protect("x")).AsSpan(4, 16));
        var where = $"xml LIKE '%id=\"{keyId:D}\"%'";
        return (await ImportDatabase.ScalarAsync<int>(connectionString, $"SELECT id FROM infra.data_protection_keys WHERE {where}"),
                (await ImportDatabase.ScalarAsync<string>(connectionString, $"SELECT xml FROM infra.data_protection_keys WHERE {where}"))!);
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
    private sealed class V2Api(string connectionString, TimeProvider time, IReadOnlyDictionary<string, string>? settings = null)
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
}
