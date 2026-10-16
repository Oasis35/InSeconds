using System.Net;
using InSeconds.IntegrationTests.Players;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;

namespace InSeconds.IntegrationTests.Security;

/// <summary>
/// Clés Data Protection chiffrées par un certificat (S16) : la base ou une sauvegarde seules ne
/// suffisent plus à fabriquer un cookie. Exigé au démarrage en prod et en staging.
/// </summary>
public class DataProtectionTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task AvecCertificat_ClesChiffreesEnBase_LisiblesSeulementAvecLeCertificat()
    {
        string cookie;
        await using (var first = new ApiFactory(_connectionString, settings: TestCertificate.Settings()))
        {
            var guest = await first.CreateClient().PostAsync("/api/players/guest", null, Ct);
            cookie = CookieHeaders.Pair(guest, "inseconds");

            var xml = await first.ScalarAsync<string>("SELECT string_agg(xml, '') FROM infra.data_protection_keys");
            Assert.Contains("encryptedSecret", xml);
            Assert.DoesNotContain("unencrypted form", xml);
        }

        // Une autre instance de l'API (redéploiement) relit la clé chiffrée grâce au certificat…
        await using (var withCertificate = new ApiFactory(_connectionString, settings: TestCertificate.Settings()))
            Assert.Equal(HttpStatusCode.OK, (await GetMeAsync(withCertificate, cookie)).StatusCode);

        // …et sans lui, elle ne peut rien en faire : le cookie n'est plus reconnu.
        await using var withoutCertificate = new ApiFactory(_connectionString);
        Assert.Equal(HttpStatusCode.NoContent, (await GetMeAsync(withoutCertificate, cookie)).StatusCode);
    }

    [Fact]
    public async Task Staging_SansCertificat_RefuseDeDemarrer()
    {
        await using var api = new ApiFactory(_connectionString, environment: Environments.Staging,
            settings: new Dictionary<string, string> { ["Brevo:ApiKey"] = "clé", ["EmailRedirect:To"] = "moi+staging@example.com" });

        var exception = Assert.ThrowsAny<Exception>(() => api.Server);

        Assert.Contains("DataProtection:CertificatePath", Flatten(exception));
    }

    [Fact]
    public async Task Production_SansCertificat_RefuseDeDemarrer()
    {
        await using var api = new ApiFactory(_connectionString, environment: Environments.Production,
            settings: new Dictionary<string, string> { ["Brevo:ApiKey"] = "clé" });

        var exception = Assert.ThrowsAny<Exception>(() => api.Server);

        Assert.Contains("DataProtection:CertificatePath", Flatten(exception));
    }

    private static async Task<HttpResponseMessage> GetMeAsync(ApiFactory api, string cookie)
    {
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/players/me");
        request.Headers.Add("Cookie", cookie);
        return await client.SendAsync(request, Ct);
    }

    private static string Flatten(Exception exception)
    {
        var messages = new List<string>();
        for (Exception? e = exception; e is not null; e = e.InnerException)
            messages.Add(e.Message);
        return string.Join(" | ", messages);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
