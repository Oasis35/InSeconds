using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.IntegrationTests.Players;

/// <summary>Profil (§ 5.6 du plan v2) : pseudo, changement d'email en deux temps.</summary>
public partial class ProfileTests(PostgresFixture postgres) : IAsyncLifetime
{
    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task Pseudo_Compte_Renomme()
    {
        var device = await _app.SignInDeviceAsync("alice@example.com", "Alice");

        var response = await device.Client.PutAsJsonAsync("/api/players/me/pseudo", new UpdatePseudo("Alicia"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Alicia", (await response.Content.ReadFromJsonAsync<PseudoResponse>(Ct))!.Pseudo);
        Assert.Equal("Alicia", (await MagicLinkApi.MeAsync(device.Client))!.Pseudo);
    }

    [Fact]
    public async Task Pseudo_LeSienAvecUneAutreCasse_Accepte()
    {
        var device = await _app.SignInDeviceAsync("casse@example.com", "Casse");

        var response = await device.Client.PutAsJsonAsync("/api/players/me/pseudo", new UpdatePseudo("CASSE"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("CASSE", (await MagicLinkApi.MeAsync(device.Client))!.Pseudo);
    }

    [Fact]
    public async Task Pseudo_PrisParUnAutre_409()
    {
        await _app.SignInDeviceAsync("premier@example.com", "Pris");
        var device = await _app.SignInDeviceAsync("second@example.com", "Second");

        var response = await device.Client.PutAsJsonAsync("/api/players/me/pseudo", new UpdatePseudo("pris"), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, PlayersErrorCodes.PseudoTaken);
    }

    [Fact]
    public async Task Pseudo_Invalide_400()
    {
        var device = await _app.SignInDeviceAsync("invalide@example.com", "Invalide");

        var response = await device.Client.PutAsJsonAsync("/api/players/me/pseudo", new UpdatePseudo("<b>"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("PUT", "/api/players/me/pseudo")]
    [InlineData("POST", "/api/players/me/email-change")]
    public async Task RoutesDeCompte_Invite_403_SansCookie_401(string method, string path)
    {
        var guest = _app.Browser();
        await guest.PostAsync("/api/players/guest", null, Ct);
        object body = path.EndsWith("pseudo", StringComparison.Ordinal) ? new UpdatePseudo("Invite") : new RequestEmailChange("invite@example.com");

        await AssertProblemAsync(await SendAsync(guest, method, path, body), HttpStatusCode.Forbidden, PlayersErrorCodes.GuestForbidden);
        Assert.Equal(HttpStatusCode.Unauthorized, (await SendAsync(_app.Browser(), method, path, body)).StatusCode);
    }

    [Fact]
    public async Task ChangementDEmail_DemandePuisConfirmation()
    {
        var device = await _app.SignInDeviceAsync("ancienne@example.com", "Change");

        var request = await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange(" Nouvelle@Example.com "), Ct);

        Assert.Equal(HttpStatusCode.NoContent, request.StatusCode);
        // Le lien part à la nouvelle adresse seulement.
        var email = await _app.WaitForEmailAsync("nouvelle@example.com", 0);
        Assert.Equal("Confirme ta nouvelle adresse email IN//SECONDS", email.Subject);
        Assert.Contains("nouvelle@example.com", email.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain(_app.Emails.Sent, e => e.To == "ancienne@example.com" && e.Subject == email.Subject);
        var token = await ConfirmTokenAsync(email);
        Assert.Equal("ancienne@example.com", (await MagicLinkApi.MeAsync(device.Client))!.Email);

        // Confirmé depuis n'importe quel navigateur : l'autorisation tient au jeton.
        var confirm = await ConfirmAsync(_app.Api.CreateClient(), token);

        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        Assert.Equal("nouvelle@example.com", (await confirm.Content.ReadFromJsonAsync<EmailChangedResponse>(Ct))!.Email);
        Assert.Equal("nouvelle@example.com", (await MagicLinkApi.MeAsync(device.Client))!.Email);
        await AssertProblemAsync(await ConfirmAsync(_app.Api.CreateClient(), token), HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);
        // La connexion se fait désormais avec la nouvelle adresse, sur le même joueur.
        Assert.Equal(device.PlayerId, (await _app.SignInDeviceAsync("nouvelle@example.com")).PlayerId);
    }

    [Fact]
    public async Task ChangementDEmail_MemeAdresse_400()
    {
        var device = await _app.SignInDeviceAsync("meme@example.com", "Meme");

        var response = await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange("MEME@example.com"), Ct);

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, PlayersErrorCodes.SameEmail);
    }

    [Fact]
    public async Task ChangementDEmail_AdresseDUnAutreCompte_409()
    {
        await _app.SignInDeviceAsync("occupee@example.com", "Occupant");
        var device = await _app.SignInDeviceAsync("demandeur@example.com", "Demandeur");

        var response = await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange("occupee@example.com"), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, PlayersErrorCodes.EmailTaken);
    }

    [Fact]
    public async Task ChangementDEmail_DeuxDemandesDansLaMinute_UnSeulLien()
    {
        var device = await _app.SignInDeviceAsync("double@example.com", "Double");

        await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange("cible1@example.com"), Ct);
        await _app.WaitForEmailAsync("cible1@example.com", 0);
        var again = await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange("cible2@example.com"), Ct);
        // Une autre demande, ensuite, prouve que la file a avancé.
        await _app.RequestTokenAsync("temoin@example.com");
        await Task.Delay(500, Ct);

        Assert.Equal(HttpStatusCode.NoContent, again.StatusCode);
        Assert.DoesNotContain(_app.Emails.Sent, e => e.To == "cible2@example.com");
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM players.auth_tokens WHERE purpose = 2 AND player_id = '{device.PlayerId}'"));
    }

    [Fact]
    public async Task Confirmation_AdressePriseEntreTemps_409_JetonGarde()
    {
        var device = await _app.SignInDeviceAsync("lent@example.com", "Lent");
        await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange("convoitee@example.com"), Ct);
        var token = await ConfirmTokenAsync(await _app.WaitForEmailAsync("convoitee@example.com", 0));
        await _app.SignInDeviceAsync("convoitee@example.com", "Rapide");

        await AssertProblemAsync(await ConfirmAsync(_app.Api.CreateClient(), token), HttpStatusCode.Conflict, PlayersErrorCodes.EmailTaken);

        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE purpose = 2 AND consumed_at IS NULL"));
        Assert.Equal("lent@example.com", (await MagicLinkApi.MeAsync(device.Client))!.Email);
    }

    [Fact]
    public async Task Confirmation_JetonExpire_400_AdresseInchangee()
    {
        var device = await _app.SignInDeviceAsync("expire@example.com", "Expire");
        await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange("tardive@example.com"), Ct);
        var token = await ConfirmTokenAsync(await _app.WaitForEmailAsync("tardive@example.com", 0));
        await _app.Api.ExecuteAsync($"UPDATE players.auth_tokens SET expires_at = now() - interval '1 minute' WHERE purpose = 2 AND player_id = '{device.PlayerId}'");

        await AssertProblemAsync(await ConfirmAsync(_app.Api.CreateClient(), token), HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);

        Assert.Equal("expire@example.com", (await MagicLinkApi.MeAsync(device.Client))!.Email);
    }

    [Fact]
    public async Task Confirmation_JetonInconnu_400()
    {
        _ = await _app.Browser().PostAsync("/api/players/guest", null, Ct);

        await AssertProblemAsync(await ConfirmAsync(_app.Api.CreateClient(), AuthTokenSecret.Generate()), HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);
    }

    [Fact]
    public async Task S2_UnJetonDeConnexion_NeChangePasDAdresse()
    {
        await _app.SignInDeviceAsync("connexion@example.com", "Connexion");
        var loginToken = await _app.RequestTokenAsync("connexion@example.com");

        await AssertProblemAsync(await ConfirmAsync(_app.Api.CreateClient(), loginToken), HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);

        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE purpose = 1 AND consumed_at IS NULL"));
    }

    [Fact]
    public async Task S11_ChangementDEmail_LimiteParJoueur_PasParIp()
    {
        await using var limited = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });
        // La connexion elle-même est limitée par IP (5 demandes de lien) : deux comptes suffisent.
        var first = await limited.SignInDeviceAsync("limite1@example.com", "Limite1");
        var second = await limited.SignInDeviceAsync("limite2@example.com", "Limite2");

        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.NoContent,
                (await first.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange($"cible{i}@example.com"), Ct)).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests,
            (await first.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange("cible5@example.com"), Ct)).StatusCode);
        // Même IP, autre joueur : pas concerné.
        Assert.Equal(HttpStatusCode.NoContent,
            (await second.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange("autre@example.com"), Ct)).StatusCode);
    }

    private static Task<HttpResponseMessage> ConfirmAsync(HttpClient client, string token) =>
        client.PostAsJsonAsync("/api/players/email-change/confirm", new ConfirmEmailChange(token), Ct);

    /// <summary>Le jeton du lien de confirmation, une fois enregistré (<see cref="MagicLinkApi.WaitForTokenAsync"/>).</summary>
    private async Task<string> ConfirmTokenAsync(Api.Testing.Email.CapturedEmail email)
    {
        var token = ConfirmLink().Match(email.HtmlBody).Groups[1].Value;
        await _app.WaitForTokenAsync(token);
        return token;
    }

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, string method, string path, object body) =>
        client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(body) }, Ct);

    internal static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct);
        Assert.Equal(code, problem!.Extensions["code"]?.ToString());
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [GeneratedRegex("http://localhost:5176/account/confirm-email\\?token=([A-Za-z0-9_-]+)")]
    private static partial Regex ConfirmLink();
}
