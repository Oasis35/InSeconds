using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Déconnexion et appareils (§ 5.5 et 5.6 du plan v2) : chaque révocation ne touche que l'appareil visé
/// (piège 39), et son cookie est refusé dès la requête suivante.
/// </summary>
public class DevicesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string ChromeAndroid = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
    private const string SafariIphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task Liste_SesAppareils_AvecLibelle_EtLeCourant()
    {
        var phone = await _app.SignInDeviceAsync("liste@example.com", "Liste", ChromeAndroid);
        var iphone = await _app.SignInDeviceAsync("liste@example.com", userAgent: SafariIphone);
        await _app.SignInDeviceAsync("autre@example.com", "Autre");

        var devices = await phone.Client.GetFromJsonAsync<List<DeviceResponse>>("/api/players/me/devices", Ct);

        Assert.Equal(2, devices!.Count);
        Assert.Equal(["Chrome · Android", "Safari · iPhone"], devices.Select(d => d.Label).Order());
        Assert.Equal("Chrome · Android", Assert.Single(devices, d => d.IsCurrent).Label);
        Assert.Equal(iphone.PlayerId, phone.PlayerId);
    }

    [Fact]
    public async Task Liste_SansCookie_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _app.Browser().GetAsync("/api/players/me/devices", Ct)).StatusCode);
    }

    [Fact]
    public async Task InviteCree_LibelleDeSonNavigateur()
    {
        var browser = _app.Browser();
        browser.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", SafariIphone);

        await browser.PostAsync("/api/players/guest", null, Ct);

        Assert.Equal("Safari · iPhone", Assert.Single(await browser.GetFromJsonAsync<List<DeviceResponse>>("/api/players/me/devices", Ct) ?? []).Label);
    }

    [Fact]
    public async Task Deconnexion_RevoqueCetAppareil_PasLesAutres()
    {
        var first = await _app.SignInDeviceAsync("piege39@example.com", "Piege39");
        var second = await _app.SignInDeviceAsync("piege39@example.com");

        var response = await first.Client.PostAsync("/api/players/auth/logout", null, Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(CookieHeaders.Deletes(response, "inseconds"));
        // Le cookie déconnecté, même rejoué, ne vaut plus rien ; l'autre appareil reste connecté.
        Assert.Null(await MagicLinkApi.MeAsync(first.Client));
        Assert.Equal(second.PlayerId, (await MagicLinkApi.MeAsync(second.Client))!.PlayerId);
    }

    [Fact]
    public async Task Deconnexion_SansCookie_204()
    {
        Assert.Equal(HttpStatusCode.NoContent, (await _app.Browser().PostAsync("/api/players/auth/logout", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task RevoquerUnAutreAppareil_RefuseEnsuite()
    {
        var mine = await _app.SignInDeviceAsync("revoque@example.com", "Revoque");
        var other = await _app.SignInDeviceAsync("revoque@example.com");
        var otherId = Assert.Single(await mine.Client.GetFromJsonAsync<List<DeviceResponse>>("/api/players/me/devices", Ct) ?? [], d => !d.IsCurrent).Id;

        var response = await mine.Client.DeleteAsync($"/api/players/me/devices/{otherId}", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(CookieHeaders.All(response));
        Assert.Null(await MagicLinkApi.MeAsync(other.Client));
        Assert.NotNull(await MagicLinkApi.MeAsync(mine.Client));
        // Déjà révoqué : comme un appareil inconnu.
        await ProfileTests.AssertProblemAsync(await mine.Client.DeleteAsync($"/api/players/me/devices/{otherId}", Ct), HttpStatusCode.NotFound, "common.not_found");
    }

    [Fact]
    public async Task RevoquerLAppareilDUnAutreJoueur_404_Intact()
    {
        var victim = await _app.SignInDeviceAsync("victime@example.com", "Victime");
        var victimDeviceId = Assert.Single(await victim.Client.GetFromJsonAsync<List<DeviceResponse>>("/api/players/me/devices", Ct) ?? []).Id;
        var attacker = await _app.SignInDeviceAsync("attaquant@example.com", "Attaquant");

        var response = await attacker.Client.DeleteAsync($"/api/players/me/devices/{victimDeviceId}", Ct);

        await ProfileTests.AssertProblemAsync(response, HttpStatusCode.NotFound, "common.not_found");
        Assert.NotNull(await MagicLinkApi.MeAsync(victim.Client));
    }

    [Fact]
    public async Task RevoquerSonPropreAppareil_CommeUneDeconnexion()
    {
        var device = await _app.SignInDeviceAsync("moi@example.com", "Moi");
        var id = Assert.Single(await device.Client.GetFromJsonAsync<List<DeviceResponse>>("/api/players/me/devices", Ct) ?? []).Id;

        var response = await device.Client.DeleteAsync($"/api/players/me/devices/{id}", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(CookieHeaders.Deletes(response, "inseconds"));
        Assert.Null(await MagicLinkApi.MeAsync(device.Client));
    }

    [Fact]
    public async Task DeconnecterLesAutres_GardeLeCourant()
    {
        var mine = await _app.SignInDeviceAsync("menage@example.com", "Menage");
        var second = await _app.SignInDeviceAsync("menage@example.com");
        var third = await _app.SignInDeviceAsync("menage@example.com");

        var response = await mine.Client.PostAsync("/api/players/me/devices/revoke-others", null, Ct);

        Assert.Equal(2, (await response.Content.ReadFromJsonAsync<RevokedDevicesResponse>(Ct))!.Revoked);
        Assert.Null(await MagicLinkApi.MeAsync(second.Client));
        Assert.Null(await MagicLinkApi.MeAsync(third.Client));
        Assert.NotNull(await MagicLinkApi.MeAsync(mine.Client));
        Assert.Equal(0, (await (await mine.Client.PostAsync("/api/players/me/devices/revoke-others", null, Ct)).Content.ReadFromJsonAsync<RevokedDevicesResponse>(Ct))!.Revoked);
    }

    [Fact]
    public async Task S11_Revocations_20Par10MinutesEtParJoueur_PuisEn429()
    {
        await using var limited = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });
        var first = await limited.SignInDeviceAsync("revocations1@example.com", "Revocations1");
        var second = await limited.SignInDeviceAsync("revocations2@example.com", "Revocations2");

        for (var i = 0; i < 20; i++)
            Assert.Equal(HttpStatusCode.OK, (await first.Client.PostAsync("/api/players/me/devices/revoke-others", null, Ct)).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await first.Client.PostAsync("/api/players/me/devices/revoke-others", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await second.Client.PostAsync("/api/players/me/devices/revoke-others", null, Ct)).StatusCode);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
