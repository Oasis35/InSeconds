using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// L'accès sur invitation (<c>runs.access</c>) : les routes admin de l'interrupteur de l'onglet Joueurs, et <see cref="IRunAccess"/>. Les 401 / 403 de
/// ces routes sont vérifiés pour toutes les routes admin par <c>Security/SecurityTests</c>.
/// </summary>
public class RunAccessTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/admin/runs/access";

    private GameApi _game = null!;
    private HttpClient _admin = null!;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 0);
        _admin = _game.Api.CreateClient(TestUser.Admin);
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<IReadOnlyList<RunAccessEntry>> ListAsync()
    {
        var response = await _admin.GetAsync(Route, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RunAccessList>(Ct))!.Entries;
    }

    [Fact]
    public async Task SansInvitation_LaListeEstVide() => Assert.Empty(await ListAsync());

    [Fact]
    public async Task Autoriser_UnCompte_LeFaitApparaitreDansLaListe()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.NewPlayerAsync("Bob");

        var response = await _admin.PutAsync($"{Route}/{alice.Id}", null, Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var entry = Assert.Single(await ListAsync());
        Assert.Equal(alice.Id, entry.PlayerId);
        Assert.Equal(DailyApi.Start, entry.GrantedAt);
    }

    [Fact]
    public async Task Autoriser_DeuxFois_GardeLaDateDOrigine()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        (await _admin.PutAsync($"{Route}/{alice.Id}", null, Ct)).EnsureSuccessStatusCode();
        var first = Assert.Single(await ListAsync()).GrantedAt;
        _game.Time.Advance(TimeSpan.FromHours(2));

        var again = await _admin.PutAsync($"{Route}/{alice.Id}", null, Ct);

        Assert.Equal(HttpStatusCode.NoContent, again.StatusCode);
        Assert.Equal(first, Assert.Single(await ListAsync()).GrantedAt);
    }

    [Fact]
    public async Task Retirer_LAccesRend204_LeCompteDisparaitDeLaListe_EtRetirerDeNouveauAussi()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        await _admin.PutAsync($"{Route}/{alice.Id}", null, Ct);
        await _admin.PutAsync($"{Route}/{bob.Id}", null, Ct);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"{Route}/{alice.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"{Route}/{alice.Id}", Ct)).StatusCode);

        Assert.Equal([bob.Id], (await ListAsync()).Select(e => e.PlayerId));
    }

    [Fact]
    public async Task UnInvite_UnJoueurInconnu_404()
    {
        var guest = await _game.NewPlayerAsync();

        foreach (var id in new[] { guest.Id, Guid.NewGuid() })
        {
            await AssertNotFoundAsync(await _admin.PutAsync($"{Route}/{id}", null, Ct));
            await AssertNotFoundAsync(await _admin.DeleteAsync($"{Route}/{id}", Ct));
        }

        Assert.Empty(await ListAsync());
    }

    [Fact]
    public async Task UnJoueurOrdinaire_NePeutNiLireNiChangerLAcces()
    {
        var alice = await _game.NewPlayerAsync("Alice");

        Assert.Equal(HttpStatusCode.Forbidden, (await alice.Client.GetAsync(Route, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await alice.Client.PutAsync($"{Route}/{alice.Id}", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await alice.Client.DeleteAsync($"{Route}/{alice.Id}", Ct)).StatusCode);
        Assert.Empty(await ListAsync());
    }

    // --- IRunAccess ---

    [Fact]
    public async Task CanPlay_UnCompteAutorise_OuUnAdminDOffice()
    {
        var invited = await _game.NewPlayerAsync("Invited");
        var other = await _game.NewPlayerAsync("Other");
        var boss = await _game.NewPlayerAsync("Boss");
        await _admin.PutAsync($"{Route}/{invited.Id}", null, Ct);

        Assert.True(await CanPlayAsync(invited.Id, current: null));
        Assert.False(await CanPlayAsync(other.Id, current: null));
        // Un admin joue d'office, sans ligne d'accès ; le rôle est celui de la requête en cours, jamais celui d'un autre joueur.
        Assert.True(await CanPlayAsync(boss.Id, new FixedPlayer(boss.Id, IsAdmin: true)));
        Assert.False(await CanPlayAsync(other.Id, new FixedPlayer(boss.Id, IsAdmin: true)));
        Assert.False(await CanPlayAsync(other.Id, new FixedPlayer(other.Id, IsAdmin: false)));
        Assert.Single(await ListAsync());
    }

    [Fact]
    public async Task SupprimerLeCompte_NeLaisseAucuneLigneDAcces()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _admin.PutAsync($"{Route}/{alice.Id}", null, Ct);

        await _game.Api.ExecuteAsync($"DELETE FROM runs.access WHERE player_id = '{alice.Id}'");

        Assert.Empty(await ListAsync());
    }

    private async Task<bool> CanPlayAsync(Guid playerId, ICurrentPlayer? current)
    {
        using var scope = _game.Api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<InSecondsDbContext>();
        var access = new InSeconds.Api.Modules.Runs.Persistence.EfRunAccess(db, current ?? new FixedPlayer(null, IsAdmin: false));
        return await access.CanPlayAsync(playerId, Ct);
    }

    private static async Task AssertNotFoundAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = (await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct))!;
        Assert.Equal("common.not_found", problem.Extensions["code"]?.ToString());
    }

    private sealed record FixedPlayer(Guid? Id, bool IsAdmin) : ICurrentPlayer
    {
        public Guid? PlayerId => Id;

        public int? DeviceSessionId => null;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
