using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// « À réécouter » (<c>GET /api/daily/replay</c>) : les morceaux que le joueur a ratés, par jour, du plus récent au plus ancien. Seulement des jours
/// publiés et des parties qu'il ne peut plus jouer (pièges 31 et 18) ; jamais les réponses d'un autre.
/// </summary>
public class ReplayTracksTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 80);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static readonly (decimal, bool, bool, bool, int) Found = (1m, true, true, false, 850);
    private static readonly (decimal, bool, bool, bool, int) ArtistOnly = (2m, true, false, false, 300);
    private static readonly (decimal, bool, bool, bool, int) Nothing = (2m, false, false, false, 0);

    private static async Task<ReplayResponse> ReplayAsync(Gamer gamer, string query = "") =>
        (await gamer.Client.GetFromJsonAsync<ReplayResponse>($"/api/daily/replay{query}", Ct))!;

    private async Task ChallengeAsync(DateOnly day, int firstTrack) =>
        await _game.App.AddChallengeAsync(day, firstTrack, firstTrack + 1, firstTrack + 2, firstTrack + 3, firstTrack + 4);

    [Fact]
    public async Task LesRatesParJour_EtLesFiltres()
    {
        var gamer = await _game.NewPlayerAsync();
        await ChallengeAsync(Today.AddDays(-2), 1);
        await ChallengeAsync(Today.AddDays(-4), 6);
        await ChallengeAsync(Today.AddDays(-5), 11);
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-2), 1, Found, ArtistOnly, Nothing, Found, Found);
        // Expirée avec une réponse ratée : elle compte (il ne peut plus la jouer).
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-4), 3, Nothing);
        // Tout trouvé : rien à réécouter ce jour-là.
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-5), 1, Found, Found, Found, Found, Found);

        var all = await ReplayAsync(gamer);

        Assert.Equal([Today.AddDays(-2), Today.AddDays(-4)], all.Days.Select(d => d.Date));
        Assert.Equal([(2, true, false), (3, false, false)], all.Days[0].Tracks.Select(t => (t.Position, t.ArtistCorrect, t.TitleCorrect)));
        Assert.All(all.Days.SelectMany(d => d.Tracks), t => Assert.False(string.IsNullOrEmpty(t.Artist)));
        Assert.Equal((3, 2, 1), (all.AllCount, all.NoneCount, all.HalfCount));
        Assert.Null(all.NextBefore);

        var none = await ReplayAsync(gamer, "?filter=none");
        Assert.Equal([(Today.AddDays(-2), 3), (Today.AddDays(-4), 1)], none.Days.SelectMany(d => d.Tracks.Select(t => (d.Date, t.Position))));

        var half = await ReplayAsync(gamer, "?filter=half");
        Assert.Equal([(Today.AddDays(-2), 2)], half.Days.SelectMany(d => d.Tracks.Select(t => (d.Date, t.Position))));
        // Les compteurs ne dépendent pas du filtre.
        Assert.Equal((3, 2, 1), (half.AllCount, half.NoneCount, half.HalfCount));
    }

    [Fact]
    public async Task Piege31_LeJourEnCours_JamaisListe_MemeTermine()
    {
        var gamer = await _game.NewPlayerAsync();
        await ChallengeAsync(Today, 1);
        await _game.AddSessionAsync(gamer.Id, Today, 1, Nothing, Nothing, Nothing, Nothing, Nothing);

        var replay = await ReplayAsync(gamer);

        Assert.Empty(replay.Days);
        Assert.Equal(0, replay.AllCount);
    }

    [Fact]
    public async Task Piege18_PartieDeLaVeilleEnCours_RienDeCeJour()
    {
        var gamer = await _game.NewPlayerAsync();
        await ChallengeAsync(Today.AddDays(-1), 1);
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-1), 0, Nothing, ArtistOnly);

        Assert.Empty((await ReplayAsync(gamer)).Days);

        await _game.Api.ExecuteAsync($"UPDATE daily.sessions SET status = 2 WHERE player_id = '{gamer.Id}'");
        Assert.Equal(2, Assert.Single((await ReplayAsync(gamer)).Days).Tracks.Count);
    }

    [Fact]
    public async Task UnePageDeDixJours_PuisLaSuite()
    {
        var gamer = await _game.NewPlayerAsync();
        for (var i = 0; i < 12; i++)
        {
            await ChallengeAsync(Today.AddDays(-2 - i), 1 + (i * 5));
            await _game.AddSessionAsync(gamer.Id, Today.AddDays(-2 - i), 1, Nothing, Found, Found, Found, Found);
        }

        var first = await ReplayAsync(gamer);
        Assert.Equal(10, first.Days.Count);
        Assert.Equal(Today.AddDays(-11), first.NextBefore);

        var second = await ReplayAsync(gamer, $"?before={first.NextBefore:yyyy-MM-dd}");
        Assert.Equal([Today.AddDays(-12), Today.AddDays(-13)], second.Days.Select(d => d.Date));
        Assert.Null(second.NextBefore);
        Assert.Equal(12, second.AllCount);
    }

    [Fact]
    public async Task UnJoueur_NeVoitQueSesRates()
    {
        var gamer = await _game.NewPlayerAsync();
        var other = await _game.NewPlayerAsync("Autre");
        await ChallengeAsync(Today.AddDays(-2), 1);
        await _game.AddSessionAsync(other.Id, Today.AddDays(-2), 1, Nothing, Nothing, Nothing, Nothing, Nothing);
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-2), 1, Found, Found, Found, Found, Nothing);

        var mine = await ReplayAsync(gamer);

        Assert.Equal(5, Assert.Single(Assert.Single(mine.Days).Tracks).Position);
        Assert.Equal(1, mine.AllCount);
    }

    [Fact]
    public async Task FiltreOuJourMalEcrit_400_PasDIdentite_401()
    {
        var gamer = await _game.NewPlayerAsync();

        foreach (var query in new[] { "?filter=tout", "?before=hier", "?before=2026-02-30" })
            await GameAsserts.ProblemAsync(await gamer.Client.GetAsync($"/api/daily/replay{query}", Ct), HttpStatusCode.BadRequest, DailyErrorCodes.InvalidReplayQuery);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync("/api/daily/replay", Ct)).StatusCode);
    }
}
