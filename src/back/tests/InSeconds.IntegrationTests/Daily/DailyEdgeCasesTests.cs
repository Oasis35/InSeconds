using System.Net;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Deux cas limites du défi du jour qu'aucun autre test ne tenait : la dernière réponse envoyée plusieurs fois en même temps (la fin de partie, la série
/// et le score ne se comptent qu'une fois), et les extraits que chaque démarrage redemande à Deezer (piège 14 : adresses signées de 15 minutes, aucun
/// cache côté serveur).
/// </summary>
public class DailyEdgeCasesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());
        await _game.GenerateAsync();
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    [Fact]
    public async Task DerniereReponse_EnvoyeeEnMemeTemps_UneSeuleFinDePartie_LaSerieMonteUneSeuleFois()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var session = (await alice.StartAsync()).SessionId;
        await alice.FinishAsync(session, fromPosition: 1, count: 4);
        var lastTrack = await _game.TrackAtAsync(Today, 5);

        var responses = await Task.WhenAll(Enumerable.Range(0, 4)
            .Select(_ => alice.AnswerAsync(session, 5, 1, $"Artiste {lastTrack}", $"Titre {lastTrack}")));

        // Une réponse finit la partie, les autres sont refusées proprement (jamais une 500 sur la clé unique).
        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(5L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.answers WHERE session_id = {session}"));
        Assert.Equal(1, await _game.Api.ScalarAsync<short>($"SELECT status FROM daily.sessions WHERE id = {session}"));
        // La série n'a monté qu'une fois : un jour joué, une série de 1 (jamais 2 ou 4), à la date du défi (piège 18).
        Assert.Equal(1, await _game.Api.ScalarAsync<int>($"SELECT current_streak FROM daily.streaks WHERE player_id = '{alice.Id}'"));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.streaks WHERE player_id = '{alice.Id}'"));
    }

    [Fact]
    public async Task Piege14_ChaqueDemarrage_RedemandeLesExtraitsADeezer_AucunCacheCoteServeur()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var before = _game.Api.FakeDeezer.Requests.Count;

        await alice.StartAsync();
        var afterAlice = _game.Api.FakeDeezer.Requests.Count;
        await bob.StartAsync();
        var afterBob = _game.Api.FakeDeezer.Requests.Count;

        // Le démarrage d'Alice demande les extraits de la partie ; celui de Bob, sur le même défi, les demande tous de nouveau : une adresse signée
        // ne se garde pas (elle expire au bout de 15 minutes).
        Assert.True(afterAlice > before, "Le démarrage ne demande rien à Deezer.");
        Assert.Equal(afterAlice - before, afterBob - afterAlice);
    }
}
