using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le nombre de parties terminées depuis le début du jeu (message de remerciement) : public, tous jours confondus, seules les parties
/// terminées comptent, les joueurs supprimés n'y figurent pas.
/// </summary>
public class GamesPlayedTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<int> CompletedGamesAsync()
    {
        var response = await _game.Api.CreateClient().GetAsync("/api/daily/stats/games-played", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<GamesPlayedResponse>(Ct))!.CompletedGames;
    }

    [Fact]
    public async Task SansPartie_Zero()
    {
        Assert.Equal(0, await CompletedGamesAsync());
    }

    [Fact]
    public async Task CompteLesPartiesTerminees_DeTousLesJours_SansLesAutresNiLesJoueursSupprimes()
    {
        var yesterday = Today.AddDays(-1);
        await _game.GenerateAsync(yesterday);
        await _game.GenerateAsync();
        var alice = await _game.NewPlayerAsync();
        var bob = await _game.NewPlayerAsync();
        var carol = await _game.NewPlayerAsync();
        var deleted = await _game.NewPlayerAsync();

        // Hier : Alice a terminé, Bob a abandonné.
        await _game.AddSessionAsync(alice.Id, yesterday, status: 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(bob.Id, yesterday, status: 2);
        // Aujourd'hui : Alice et le joueur supprimé ont terminé, Carol est en cours.
        await alice.FinishAsync((await alice.StartAsync()).SessionId);
        await deleted.FinishAsync((await deleted.StartAsync()).SessionId);
        var carolSession = (await carol.StartAsync()).SessionId;
        await carol.AnswerCorrectlyAsync(carolSession, 1, 1);
        await _game.DeletePlayerAsync(deleted.Id);

        Assert.Equal(2, await CompletedGamesAsync());
    }
}
