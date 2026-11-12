using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.IntegrationTests.Daily;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// La modération des pseudos dans l'admin (<c>POST /api/admin/accounts/{playerId}/pseudo/reset</c>) : un compte reçoit un pseudo de remplacement libre
/// et valide, le pseudo d'un invité est retiré, un joueur inconnu répond 404, un joueur simple 403, et le journal ne garde que des identifiants.
/// </summary>
public class AdminPseudoTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly CapturedLogs _logs = new();
    private GameApi _game = null!;
    private HttpClient _admin = null!;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(
            await postgres.CreateDatabaseAsync(), tracks: 0, configureServices: services => services.AddSingleton<ILoggerProvider>(_logs));
        _admin = _game.App.Admin();
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string Route(Guid playerId) => $"/api/admin/accounts/{playerId}/pseudo/reset";

    [Fact]
    public async Task UnCompte_RecoitUnPseudoDeRemplacement_ValideEtLibre()
    {
        var alice = await _game.NewPlayerAsync("PseudoInapproprie");

        var response = await _admin.PostAsync(Route(alice.Id), null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var pseudo = (await response.Content.ReadFromJsonAsync<ResetPseudoResponse>(Ct))!.Pseudo;
        Assert.Matches(new Regex("^Joueur[0-9]{4,5}$"), pseudo);
        Assert.True(PseudoRules.IsValid(pseudo, 3, 20));
        Assert.Equal(pseudo, await _game.Api.ScalarAsync<string>($"SELECT pseudo FROM players.accounts WHERE player_id = '{alice.Id}'"));
    }

    [Fact]
    public async Task DeuxRemisesAZero_DonnentDesPseudosDifferents_CommeLaContrainteDUnicite()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));

        var first = (await (await _admin.PostAsync(Route(alice.Id), null, Ct)).Content.ReadFromJsonAsync<ResetPseudoResponse>(Ct))!.Pseudo;
        var second = (await (await _admin.PostAsync(Route(bob.Id), null, Ct)).Content.ReadFromJsonAsync<ResetPseudoResponse>(Ct))!.Pseudo;

        Assert.NotEqual(first, second);
    }

    [Fact]
    public async Task UnInvite_VoitSonPseudoRetire()
    {
        var guest = await _game.NewPlayerAsync();
        await _game.Api.ExecuteAsync($"UPDATE players.players SET guest_pseudo = 'Insulte' WHERE id = '{guest.Id}'");

        var response = await _admin.PostAsync(Route(guest.Id), null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null((await response.Content.ReadFromJsonAsync<ResetPseudoResponse>(Ct))!.Pseudo);
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM players.players WHERE id = '{guest.Id}' AND guest_pseudo IS NOT NULL"));
    }

    [Fact]
    public async Task JoueurInconnu_404()
    {
        var response = await _admin.PostAsync(Route(Guid.NewGuid()), null, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UnJoueurSimple_403_EtSonPseudoNeChange()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");

        var response = await alice.Client.PostAsync(Route(bob.Id), null, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Bob", await _game.Api.ScalarAsync<string>($"SELECT pseudo FROM players.accounts WHERE player_id = '{bob.Id}'"));
    }

    [Fact]
    public async Task Journal_DesIdentifiantsSeulement_JamaisLAncienNiLeNouveauPseudo()
    {
        var alice = await _game.NewPlayerAsync("PseudoInapproprie");

        var pseudo = (await (await _admin.PostAsync(Route(alice.Id), null, Ct)).Content.ReadFromJsonAsync<ResetPseudoResponse>(Ct))!.Pseudo!;

        var entry = Assert.Single(_logs.Entries, e => e.EventId == 1010);
        Assert.Contains(alice.Id.ToString(), entry.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(_logs.Entries, e =>
            e.Message.Contains("PseudoInapproprie", StringComparison.Ordinal) || e.Message.Contains(pseudo, StringComparison.Ordinal));
    }
}
