using System.Net;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Deux cas limites du défi du jour : la **dernière** réponse envoyée plusieurs fois en même temps (celle qui finit la partie et fait monter la série ;
/// `PlaySessionTests` tient déjà la course sur la première), et les extraits que chaque démarrage redemande à Deezer, vus de bout en bout (piège 14 :
/// adresses signées de 15 minutes, aucun cache côté serveur ; `DeezerCacheTests` le tient au niveau du port).
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
    public async Task DerniereReponse_EnvoyeeEnMemeTemps_UneSeuleFinDePartie_LesAutresRefusees409_LaSerieMonteUneSeuleFois()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        // Une série de 1 jour finie la veille : une seule complétion la porte à 2 ; une complétion comptée deux fois la remettrait à 1.
        await _game.SetStreakAsync(alice.Id, streak: 1, lastPlayed: Today.AddDays(-1), freezes: 0);
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
        // Le score est celui des cinq réponses, compté une fois.
        Assert.Equal(
            await _game.Api.ScalarAsync<long>($"SELECT sum(score) FROM daily.answers WHERE session_id = {session}"),
            await _game.Api.ScalarAsync<int>($"SELECT total_score FROM daily.sessions WHERE id = {session}"));
        // La série a monté une fois (de 1 à 2), à la date du défi (piège 18) ; une seule ligne de série.
        Assert.Equal(2, await _game.Api.ScalarAsync<int>($"SELECT current_streak FROM daily.streaks WHERE player_id = '{alice.Id}'"));
        Assert.Equal(Today.ToString("yyyy-MM-dd"), await _game.Api.ScalarAsync<string>($"SELECT to_char(last_played_date, 'YYYY-MM-DD') FROM daily.streaks WHERE player_id = '{alice.Id}'"));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.streaks WHERE player_id = '{alice.Id}'"));
    }

    [Fact]
    public async Task Piege14_ChaqueDemarrage_RedemandeLesExtraitsADeezer_AucunCacheCoteServeur()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var before = _game.Api.FakeDeezer.Requests.Count;

        await alice.StartAsync();
        var aliceRequests = _game.Api.FakeDeezer.Requests.Skip(before).Order().ToList();
        await bob.StartAsync();
        var bobRequests = _game.Api.FakeDeezer.Requests.Skip(before + aliceRequests.Count).Order().ToList();

        // Le démarrage d'Alice demande l'extrait de chacun des morceaux du défi ; celui de Bob, sur le même défi, redemande exactement les mêmes : une
        // adresse signée ne se garde pas (elle expire au bout de 15 minutes).
        Assert.Equal((await _game.App.TracksOfAsync(Today)).Count, aliceRequests.Count);
        Assert.All(aliceRequests, request => Assert.Contains("/track/", request, StringComparison.Ordinal));
        Assert.Equal(aliceRequests, bobRequests);
    }
}
