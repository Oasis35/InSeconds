using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Auth.ConfirmEmailChange;
using InSeconds.Api.Features.Auth.RequestEmailChange;
using InSeconds.Api.Features.Players.GetCurrentPlayer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class EmailChangeTests(IntegrationTestFactory factory) : IAsyncLifetime
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

    private static string ExtractConfirmToken(string html)
    {
        var match = System.Text.RegularExpressions.Regex.Match(html, "token=([^&\"]+)");
        Assert.True(match.Success);
        return match.Groups[1].Value;
    }

    [Fact]
    public async Task RequestEmailChange_Guest_Returns403()
    {
        var client = factory.CreateClient();
        // Force la création paresseuse d'un Player guest (cf. UpdatePseudoTests).
        await client.GetAsync("/api/players/me");

        var resp = await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "peu-importe@example.com" });

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task RequestEmailChange_MemeEmail_Returns400()
    {
        var client = await LinkedClientAsync("actuel@example.com", "Testeur");

        var resp = await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "actuel@example.com" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task RequestEmailChange_EmailDejaPrisParAutrePlayer_Returns409()
    {
        await LinkedClientAsync("dejapris@example.com", "Alice");
        var clientB = await LinkedClientAsync("autrecompte@example.com", "Bob");

        var resp = await clientB.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "dejapris@example.com" });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task RequestEmailChange_DemandeRepetee_MoinsDe60s_NeRecreePasDeToken()
    {
        var client = await LinkedClientAsync("actuel2@example.com", "Testeur");

        await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "nouveau@example.com" });
        await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "nouveau@example.com" });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var count = await db.EmailChangeTokens.CountAsync(t => t.NewEmail == "nouveau@example.com");

        Assert.Equal(1, count);
    }

    [Fact]
    public async Task RequestEmailChange_Succes_EnvoieEmailANouvelleAdresse()
    {
        var client = await LinkedClientAsync("actuel3@example.com", "Testeur");

        var resp = await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "nouveau3@example.com" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var capture = factory.Services.GetRequiredService<InSeconds.Api.Common.Email.TestEmailCapture>();
        Assert.True(capture.TryGetLast("nouveau3@example.com", out var lastEmail));
        Assert.Contains("nouveau3@example.com", lastEmail.Html);
    }

    [Fact]
    public async Task ConfirmEmailChange_TokenInvalide_Returns400()
    {
        var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/auth/email-change/confirm", new { Token = "token-inexistant" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task ConfirmEmailChange_TokenExpire_Returns400()
    {
        var client = await LinkedClientAsync("actuel4@example.com", "Testeur");
        await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "nouveau4@example.com" });

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var token = await db.EmailChangeTokens.SingleAsync(t => t.NewEmail == "nouveau4@example.com");
            token.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        var capture = factory.Services.GetRequiredService<InSeconds.Api.Common.Email.TestEmailCapture>();
        Assert.True(capture.TryGetLast("nouveau4@example.com", out var lastEmail));
        var token2 = ExtractConfirmToken(lastEmail.Html);

        var resp = await client.PostAsJsonAsync("/api/auth/email-change/confirm", new { Token = token2 });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task ConfirmEmailChange_TokenDejaConsomme_Returns400()
    {
        var client = await LinkedClientAsync("actuel5@example.com", "Testeur");
        await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "nouveau5@example.com" });

        var capture = factory.Services.GetRequiredService<InSeconds.Api.Common.Email.TestEmailCapture>();
        Assert.True(capture.TryGetLast("nouveau5@example.com", out var lastEmail));
        var token = ExtractConfirmToken(lastEmail.Html);

        var first = await client.PostAsJsonAsync("/api/auth/email-change/confirm", new { Token = token });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/auth/email-change/confirm", new { Token = token });
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    [Fact]
    public async Task ConfirmEmailChange_Succes_MetAJourEmailDuPlayer()
    {
        var client = await LinkedClientAsync("actuel6@example.com", "Testeur");
        await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "nouveau6@example.com" });

        var capture = factory.Services.GetRequiredService<InSeconds.Api.Common.Email.TestEmailCapture>();
        Assert.True(capture.TryGetLast("nouveau6@example.com", out var lastEmail));
        var token = ExtractConfirmToken(lastEmail.Html);

        var resp = await client.PostAsJsonAsync("/api/auth/email-change/confirm", new { Token = token });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<ConfirmEmailChangeResponse>();
        Assert.Equal("nouveau6@example.com", body!.Email);

        var me = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");
        Assert.Equal("nouveau6@example.com", me!.Email);
    }

    [Fact]
    public async Task ConfirmEmailChange_EmailPrisEntreTempsParAutrePlayer_Returns409_TokenNonConsomme()
    {
        var client = await LinkedClientAsync("actuel7@example.com", "Testeur");
        await client.PutAsJsonAsync("/api/players/me/email", new { NewEmail = "convoite@example.com" });

        var capture = factory.Services.GetRequiredService<InSeconds.Api.Common.Email.TestEmailCapture>();
        Assert.True(capture.TryGetLast("convoite@example.com", out var lastEmail));
        var token = ExtractConfirmToken(lastEmail.Html);

        // Un autre joueur prend l'adresse convoitée entre la demande et la confirmation.
        await LinkedClientAsync("convoite@example.com", "AutreJoueur");

        var resp = await client.PostAsJsonAsync("/api/auth/email-change/confirm", new { Token = token });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storedToken = await db.EmailChangeTokens.SingleAsync(t => t.NewEmail == "convoite@example.com");
        Assert.Null(storedToken.ConsumedAt);
    }
}
