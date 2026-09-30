using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace InSeconds.Api.IntegrationTests.Auth;

[Collection("Integration")]
public class LogoutTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Logout_ViderLeCookie_ProchaineRequeteCreeUnNouveauGuest()
    {
        var client = factory.CreateClient();

        var meBefore = await client.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        var logoutResp = await client.PostAsync("/api/auth/logout", content: null);
        Assert.True(logoutResp.IsSuccessStatusCode);

        var meAfter = await client.GetFromJsonAsync<PlayerMeDto>("/api/players/me");

        Assert.NotEqual(meBefore!.PlayerId, meAfter!.PlayerId);
        Assert.True(meAfter.IsGuest);
    }

    // Régression du 30/09 (piège 39) : tous les appareils d'un compte v1 partagent le même
    // AuthToken. Se déconnecter sur un appareil ne doit effacer que son cookie : un autre
    // appareil qui présente le même cookie doit rester connecté au même compte.
    [Fact]
    public async Task Logout_SurUnAppareil_NeDeconnectePasLesAutresAppareilsDuCompte()
    {
        var deviceA = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

        var firstResp = await deviceA.GetAsync("/api/players/me");
        var meBefore = await firstResp.Content.ReadFromJsonAsync<PlayerMeDto>();
        var authTokenCookie = firstResp.Headers.GetValues("Set-Cookie").First().Split(';')[0];

        deviceA.DefaultRequestHeaders.Add("Cookie", authTokenCookie);
        var logoutResp = await deviceA.PostAsync("/api/auth/logout", content: null);
        Assert.True(logoutResp.IsSuccessStatusCode);

        // Deuxième appareil connecté au même compte (même cookie, cf. reconnexion par lien magique).
        var deviceB = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        deviceB.DefaultRequestHeaders.Add("Cookie", authTokenCookie);

        // peek=true ne crée jamais de Player : PlayerId vaudrait Guid.Empty si le cookie ne
        // résolvait plus personne.
        var afterResp = await deviceB.GetAsync("/api/players/me?peek=true");
        var meAfter = await afterResp.Content.ReadFromJsonAsync<PlayerMeDto>();

        Assert.Equal(meBefore!.PlayerId, meAfter!.PlayerId);
    }

    private sealed record PlayerMeDto(Guid PlayerId, bool IsGuest, string? Email, string? Pseudo);
}
