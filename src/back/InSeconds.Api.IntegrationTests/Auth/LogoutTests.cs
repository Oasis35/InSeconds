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

    // M6 (revue du 25/09) : se déconnecter doit révoquer le cookie côté serveur, pas
    // seulement l'effacer côté navigateur — un cookie authToken déjà copié ailleurs (ou volé)
    // restait valide jusqu'à ses 90 jours sinon. On capture le cookie brut manuellement
    // (HandleCookies=false) pour le rejouer après logout, comme le ferait un cookie volé.
    [Fact]
    public async Task Logout_RevoqueLAuthTokenCoteServeur_LAncienCookieRejoueDevientOrphelin()
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

        var firstResp = await client.GetAsync("/api/players/me");
        var meBefore = await firstResp.Content.ReadFromJsonAsync<PlayerMeDto>();
        var authTokenCookie = firstResp.Headers.GetValues("Set-Cookie").First().Split(';')[0];

        client.DefaultRequestHeaders.Add("Cookie", authTokenCookie);
        var logoutResp = await client.PostAsync("/api/auth/logout", content: null);
        Assert.True(logoutResp.IsSuccessStatusCode);

        // Client indépendant qui ne connaît que l'ancien cookie capturé avant la déconnexion —
        // simule un cookie volé/copié rejoué après coup.
        var replayClient = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        replayClient.DefaultRequestHeaders.Add("Cookie", authTokenCookie);

        // peek=true ne crée jamais de Player : PlayerId reste Guid.Empty si l'ancien cookie
        // ne résout plus personne.
        var afterResp = await replayClient.GetAsync("/api/players/me?peek=true");
        var meAfter = await afterResp.Content.ReadFromJsonAsync<PlayerMeDto>();

        Assert.Equal(Guid.Empty, meAfter!.PlayerId);
        Assert.NotEqual(meBefore!.PlayerId, meAfter.PlayerId);
    }

    private sealed record PlayerMeDto(Guid PlayerId, bool IsGuest, string? Email, string? Pseudo);
}
