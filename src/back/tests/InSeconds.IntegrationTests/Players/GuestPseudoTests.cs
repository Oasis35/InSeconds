using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;

namespace InSeconds.IntegrationTests.Players;

/// <summary>Le pseudo d'un invité (<c>PUT /api/players/me/guest-pseudo</c>) : retrouvé par son navigateur, jamais celui d'un compte.</summary>
public class GuestPseudoTests(PostgresFixture postgres) : IAsyncLifetime
{
    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpClient> GuestAsync()
    {
        var guest = _app.Browser();
        await guest.PostAsync("/api/players/guest", null, Ct);
        return guest;
    }

    [Fact]
    public async Task UnInvite_SeDonneUnPseudo_QuIlRetrouveALaVisiteSuivante()
    {
        var guest = await GuestAsync();
        Assert.Null((await MagicLinkApi.MeAsync(guest))!.Pseudo);

        var response = await guest.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo("  Léa  "), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Léa", (await response.Content.ReadFromJsonAsync<PseudoResponse>(Ct))!.Pseudo);
        var me = await MagicLinkApi.MeAsync(guest);
        Assert.Equal((true, "Léa"), (me!.IsGuest, me.Pseudo));
        // Il peut le changer.
        Assert.Equal(HttpStatusCode.OK, (await guest.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo("Léo"), Ct)).StatusCode);
        Assert.Equal("Léo", (await MagicLinkApi.MeAsync(guest))!.Pseudo);
    }

    [Fact]
    public async Task AucuneUnicite_EntreInvites()
    {
        var first = await GuestAsync();
        var second = await GuestAsync();

        Assert.Equal(HttpStatusCode.OK, (await first.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo("Léa"), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await second.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo("léa"), Ct)).StatusCode);
    }

    [Fact]
    public async Task LePseudoD_unCompte_EstReserve_SansTenirCompteDeLaCasse()
    {
        await _app.SignInDeviceAsync("compte@example.com", "Alice");
        var guest = await GuestAsync();

        var response = await guest.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo("alice"), Ct);

        await ProfileTests.AssertProblemAsync(response, HttpStatusCode.Conflict, PlayersErrorCodes.PseudoTaken);
        Assert.Null((await MagicLinkApi.MeAsync(guest))!.Pseudo);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("<b>lien</b>")]
    [InlineData("http://x.fr")]
    [InlineData("   ")]
    public async Task PseudoInvalide_400(string pseudo)
    {
        var guest = await GuestAsync();

        var response = await guest.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo(pseudo), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UnCompte_409_SansCookie_401()
    {
        var device = await _app.SignInDeviceAsync("compte2@example.com", "Bob");

        await ProfileTests.AssertProblemAsync(
            await device.Client.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo("Autre"), Ct), HttpStatusCode.Conflict, PlayersErrorCodes.NotAGuest);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _app.Browser().PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo("Autre"), Ct)).StatusCode);
    }

    [Fact]
    public async Task L_export_contient_le_pseudo_de_l_invite()
    {
        var guest = await GuestAsync();
        await guest.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo("Léa"), Ct);

        var export = await guest.GetFromJsonAsync<System.Text.Json.JsonDocument>("/api/players/me/export", Ct);

        Assert.Equal("Léa", export!.RootElement.GetProperty("guestPseudo").GetString());
    }
}
