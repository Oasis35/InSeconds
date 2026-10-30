using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le défi du jour masqué à un admin tant qu'il n'a pas fini sa partie, et « Afficher quand même » : le défi se montre, et sa partie de ce défi
/// sort de toutes les statistiques.
/// </summary>
public class TodayChallengeMaskTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string MaskRoute = "/api/admin/daily/today-mask";
    private const string RevealRoute = "/api/admin/daily/today-mask/reveal";

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static Task<TodayChallengeMaskResponse> MaskAsync(Gamer admin) =>
        admin.Client.GetFromJsonAsync<TodayChallengeMaskResponse>(MaskRoute, Ct)!;

    private static async Task RevealAsync(Gamer admin) =>
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.PostAsync(RevealRoute, null, Ct)).StatusCode);

    private static Task<TodayStatsResponse> StatsAsync(HttpClient client) =>
        client.GetFromJsonAsync<TodayStatsResponse>("/api/daily/stats/today", Ct)!;

    /// <summary>Quatre joueurs finissent le défi du jour, chacun à un palier (1, 2, 3, 5 s).</summary>
    private async Task FourPlayersFinishAsync()
    {
        foreach (var seconds in new[] { 1m, 2m, 3m, 5m })
        {
            var player = await _game.NewPlayerAsync();
            await player.FinishAsync((await player.StartAsync()).SessionId, seconds: seconds);
        }
    }

    [Fact]
    public async Task SansDefi_RienNestMasque()
    {
        var admin = await _game.NewAdminAsync();

        Assert.Equal(TodayChallengeMaskResponse.Visible, await MaskAsync(admin));
        await RevealAsync(admin);
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_reveals"));
    }

    [Fact]
    public async Task PasJoue_OuEnCours_Masque_PuisVisibleUneFoisFini()
    {
        await _game.GenerateAsync();
        var admin = await _game.NewAdminAsync();

        Assert.Equal(new TodayChallengeMaskResponse(true, Today), await MaskAsync(admin));
        var session = (await admin.StartAsync()).SessionId;
        Assert.True((await MaskAsync(admin)).Hidden);

        await admin.FinishAsync(session);

        Assert.Equal(TodayChallengeMaskResponse.Visible, await MaskAsync(admin));
    }

    [Fact]
    public async Task Abandon_DefiVisible()
    {
        await _game.GenerateAsync();
        var admin = await _game.NewAdminAsync();
        var session = (await admin.StartAsync()).SessionId;

        await admin.AbandonAsync(session);

        Assert.False((await MaskAsync(admin)).Hidden);
    }

    [Fact]
    public async Task SansAfficher_LaPartieDeLAdminCompteCommeLesAutres()
    {
        await _game.GenerateAsync();
        await FourPlayersFinishAsync();
        var admin = await _game.NewAdminAsync();
        await admin.FinishAsync((await admin.StartAsync()).SessionId, seconds: 1);

        var stats = await StatsAsync(admin.Client);

        Assert.Equal(5, stats.TotalPlayers);
        Assert.Equal(5, (await _game.App.Admin().GetFromJsonAsync<GamesPlayedResponse>("/api/daily/stats/games-played", Ct))!.CompletedGames);
    }

    [Fact]
    public async Task AfficherQuandMeme_AvantDeJouer_LaPartieSortDesStats_LAdminVoitSonScore()
    {
        await _game.GenerateAsync();
        await FourPlayersFinishAsync();
        var admin = await _game.NewAdminAsync();

        await RevealAsync(admin);
        Assert.False((await MaskAsync(admin)).Hidden);
        await admin.FinishAsync((await admin.StartAsync()).SessionId, seconds: 0.5m);

        var mine = await StatsAsync(admin.Client);
        var anonymous = await StatsAsync(_game.Api.CreateClient());

        // Sa partie n'est ni dans le nombre de joueurs, ni dans la médiane ou la répartition, ni dans les morceaux.
        Assert.Equal((4, 4), (mine.TotalPlayers, anonymous.TotalPlayers));
        Assert.Equal(4, anonymous.ScoreDistribution.Sum(b => b.Count));
        Assert.All(mine.Tracks, t => Assert.Equal(0, t.GuessTimeDistribution.First(b => b.DurationSeconds == 0.5m).Count));
        // Il voit son score, et sa place parmi les quatre autres (tous en dessous de 5 × 1000).
        Assert.Equal((5000, 100), (mine.YourScore, mine.BetterThanPercent));
        Assert.Equal(4, (await _game.App.Admin().GetFromJsonAsync<GamesPlayedResponse>("/api/daily/stats/games-played", Ct))!.CompletedGames);
    }

    [Fact]
    public async Task AfficherQuandMeme_PartieEnCours_ElleSortAussiDesStats_EtDeLAdmin()
    {
        await _game.GenerateAsync();
        await FourPlayersFinishAsync();
        var admin = await _game.NewAdminAsync();
        var session = (await admin.StartAsync()).SessionId;

        await RevealAsync(admin);
        await RevealAsync(admin);
        await admin.FinishAsync(session);

        var stats = (await _game.App.Admin().GetFromJsonAsync<AdminChallengeStatsResponse>("/api/admin/daily/challenges/stats", Ct))!.Challenges.Single();
        Assert.Equal(4, stats.PlayerCount);
        Assert.DoesNotContain(stats.Players, p => p.PlayerId == admin.Id);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_reveals"));
    }

    [Fact]
    public async Task PartieDejaFinie_AfficherNeLaSortPasDesStats()
    {
        await _game.GenerateAsync();
        await FourPlayersFinishAsync();
        var admin = await _game.NewAdminAsync();
        await admin.FinishAsync((await admin.StartAsync()).SessionId);

        // Un onglet resté ouvert sur le bandeau : le clic arrive après la fin de la partie.
        await RevealAsync(admin);

        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_reveals"));
        Assert.Equal(5, (await StatsAsync(admin.Client)).TotalPlayers);
    }

    [Fact]
    public async Task RéponsesDHier_LAdminQuiAAffiche_VoitSaPlaceParmiLesAutres()
    {
        await _game.GenerateAsync();
        await FourPlayersFinishAsync();
        var admin = await _game.NewAdminAsync();
        await RevealAsync(admin);
        await admin.FinishAsync((await admin.StartAsync()).SessionId, seconds: 0.5m);
        _game.Time.Advance(TimeSpan.FromDays(1));

        var me = await admin.Client.GetFromJsonAsync<ArchiveMeResponse>($"/api/daily/archive/{Today:yyyy-MM-dd}/me", Ct);

        Assert.Equal((5000, 100), (me!.Score, me.BetterThanPercent));
    }

    [Fact]
    public async Task ReserveAUnAdmin_401Et403()
    {
        var player = await _game.NewPlayerAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync(MaskRoute, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await player.Client.GetAsync(MaskRoute, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await player.Client.PostAsync(RevealRoute, null, Ct)).StatusCode);
    }
}
