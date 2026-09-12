using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Players.GetCurrentPlayer;
using InSeconds.Api.Features.Players.UpdatePseudo;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class UpdatePseudoTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<HttpClient> LinkedClientAsync(string email, string pseudo)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");

        await client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = email });

        var capture = factory.Services.GetRequiredService<InSeconds.Api.Common.Email.TestEmailCapture>();
        Assert.True(capture.TryGetLast(email, out var lastEmail));
        var match = System.Text.RegularExpressions.Regex.Match(lastEmail.Html, "token=([^&\"]+)");
        Assert.True(match.Success);

        await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = match.Groups[1].Value, Pseudo = pseudo });
        return client;
    }

    [Fact]
    public async Task UpdatePseudo_CompteLie_Succes()
    {
        var client = await LinkedClientAsync("pseudo-succes@e2e.test", "AncienPseudo");

        var resp = await client.PutAsJsonAsync("/api/players/me/pseudo", new { Pseudo = "NouveauPseudo" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<UpdatePseudoResponse>();
        Assert.NotNull(body);
        Assert.Equal("NouveauPseudo", body.Pseudo);

        var me = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");
        Assert.Equal("NouveauPseudo", me!.Pseudo);
    }

    [Fact]
    public async Task UpdatePseudo_PseudoDejaPris_Returns409()
    {
        await LinkedClientAsync("pseudo-pris-a@e2e.test", "PseudoExistant");
        var clientB = await LinkedClientAsync("pseudo-pris-b@e2e.test", "AutrePseudo");

        var resp = await clientB.PutAsJsonAsync("/api/players/me/pseudo", new { Pseudo = "PseudoExistant" });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);

        var me = await clientB.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");
        Assert.Equal("AutrePseudo", me!.Pseudo);
    }

    [Fact]
    public async Task UpdatePseudo_PseudoInvalide_Returns400()
    {
        var client = await LinkedClientAsync("pseudo-invalide@e2e.test", "PseudoValide");

        var resp = await client.PutAsJsonAsync("/api/players/me/pseudo", new { Pseudo = "ab" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task UpdatePseudo_Guest_Returns403()
    {
        var client = factory.CreateClient();
        // Force la création paresseuse d'un Player guest (sans ça, aucun cookie n'existe
        // et GetPlayerIdOrNull() renverrait null avant même d'atteindre le handler).
        await client.GetAsync("/api/players/me");

        var resp = await client.PutAsJsonAsync("/api/players/me/pseudo", new { Pseudo = "PeuImporte" });

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }
}
