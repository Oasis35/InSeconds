using System.Net;
using System.Net.Http.Json;

namespace InSeconds.Api.IntegrationTests.Auth;

[Collection("Integration")]
public class DevLoginTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // La suite d'intégration tourne en environnement Testing, où MapDevLoginEndpoint()
    // ne doit jamais être enregistré (seulement sous IsDevelopment(), cf. Program.cs).
    // Protège contre une régression future du `if` qui exposerait l'endpoint hors
    // développement local. Pas de test positif dédié : la logique (AccountLinkingService
    // + IssueCookie) est déjà couverte par VerifyMagicLinkTests.cs, seule la vérification
    // du token est court-circuitée par DevLogin.
    [Fact]
    public async Task DevLogin_NonMonteEnTesting_Returns404()
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/dev-login", new { Email = "user1@dev.local" });

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
