using System.Net;
using System.Net.Http.Json;
using System.Xml.Linq;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Modules.Daily.Application;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Les réponses des jours passés (#407) : publiées dès le lendemain, jamais le jour même ; la veille calculée en direct, J-2 et avant lus dans la
/// photo figée. Que des pourcentages, et rien sous 5 joueurs ; la partie du joueur passe par une route à part, jamais mise en cache.
/// </summary>
public class ChallengeArchiveTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly Yesterday = Today.AddDays(-1);
    private static readonly DateOnly Frozen = Today.AddDays(-2);

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    /// <summary>
    /// Un jour passé et <paramref name="players"/> parties terminées : le premier joueur trouve tout à 1 s (4250), les autres ratent le premier
    /// morceau et trouvent le reste à 2 s (2200). Plus une partie abandonnée, qui ne compte pas dans le seuil.
    /// </summary>
    private async Task<IReadOnlyList<Gamer>> SeedDayAsync(DateOnly day, int players)
    {
        await _game.App.AddChallengeAsync(day, 1, 2, 3, 4, 5);
        var gamers = new List<Gamer>();
        for (var i = 0; i < players; i++)
        {
            var gamer = await _game.NewPlayerAsync();
            if (i == 0)
                await _game.AddSessionAsync(gamer.Id, day, 1, Enumerable.Repeat((1m, true, true, false, 850), 5).ToArray());
            else
                await _game.AddSessionAsync(gamer.Id, day, 1,
                    [(1m, false, false, false, 0), (2m, true, true, true, 550), (2m, true, true, true, 550), (2m, true, false, true, 550), (2m, true, true, true, 550)]);
            gamers.Add(gamer);
        }

        await _game.AddSessionAsync((await _game.NewPlayerAsync()).Id, day, 2, (1m, true, true, false, 850));
        return gamers;
    }

    private async Task<ArchiveDayResponse> DayAsync(DateOnly day, HttpClient? client = null) =>
        (await (client ?? _game.Api.CreateClient()).GetFromJsonAsync<ArchiveDayResponse>($"/api/daily/archive/{day:yyyy-MM-dd}", Ct))!;

    private async Task<ArchiveMeResponse> MeAsync(DateOnly day, HttpClient client) =>
        (await client.GetFromJsonAsync<ArchiveMeResponse>($"/api/daily/archive/{day:yyyy-MM-dd}/me", Ct))!;

    private Task FreezeAsync(DateOnly day) =>
        _game.App.Admin().PostAsync($"/api/admin/daily/challenges/{day:yyyy-MM-dd}/stats/recompute", null, Ct);

    [Fact]
    public async Task LaVeille_EstPubliee_EnDirect_EnPourcentages()
    {
        await SeedDayAsync(Yesterday, players: 5);

        var response = await _game.Api.CreateClient().GetAsync($"/api/daily/archive/{Yesterday:yyyy-MM-dd}", Ct);
        var day = (await response.Content.ReadFromJsonAsync<ArchiveDayResponse>(Ct))!;

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(ChallengeArchive.YesterdayCacheControl, response.Headers.CacheControl?.ToString());
        Assert.Equal((Yesterday, true, (DateOnly?)null), (day.Date, day.HasStats, day.NextDate));
        // Scores : 4250 une fois, 2200 quatre fois ; médiane 2200.
        Assert.Equal((2200, 2200, 4250, 5000), (day.MedianScore, day.MinScore, day.MaxScore, day.MaxPossibleScore));
        Assert.Equal(10, day.ScoreDistribution.Count);
        Assert.Equal([80, 20], day.ScoreDistribution.Where(b => b.Percent > 0).Select(b => b.Percent));
        Assert.Equal([1, 2, 3, 4, 5], day.Tracks.Select(t => t.Position));
        // Le premier morceau : 6 réponses (5 terminées, 1 abandonnée), deux trouvées à 1 s, quatre ratées.
        var first = day.Tracks[0];
        Assert.Equal(("Artiste 1", "Titre 1", 1001L), (first.Artist, first.Title, first.DeezerTrackId));
        Assert.Equal((33, 33, 67), (first.ArtistFoundPercent, first.TitleFoundPercent, first.NotFoundPercent));
        Assert.Equal(33, first.GuessSteps.Single(s => s.DurationSeconds == 1m).Percent);
        // Le quatrième (pas de réponse de la partie abandonnée) : le titre raté par quatre joueurs sur cinq.
        Assert.Equal((100, 20), (day.Tracks[3].ArtistFoundPercent, day.Tracks[3].TitleFoundPercent));
    }

    [Fact]
    public async Task UnJourFige_EstLuDansLaPhoto_EtCacheUnJour()
    {
        await SeedDayAsync(Frozen, players: 5);
        await FreezeAsync(Frozen);
        // Une partie ajoutée après la photo n'y est pas : la page lit la photo, pas les parties.
        await _game.AddSessionAsync((await _game.NewPlayerAsync()).Id, Frozen, 1, Enumerable.Repeat((10m, true, true, true, 100), 5).ToArray());

        var response = await _game.Api.CreateClient().GetAsync($"/api/daily/archive/{Frozen:yyyy-MM-dd}", Ct);
        var day = (await response.Content.ReadFromJsonAsync<ArchiveDayResponse>(Ct))!;

        Assert.Equal(ChallengeArchive.FrozenCacheControl, response.Headers.CacheControl?.ToString());
        Assert.Equal((2200, 2200), (day.MinScore, day.MedianScore));
    }

    [Fact]
    public async Task AucunNombreDeJoueurs_NiDonneeDUnJoueur()
    {
        var gamers = await SeedDayAsync(Yesterday, players: 5);

        var body = await _game.Api.CreateClient().GetStringAsync($"/api/daily/archive/{Yesterday:yyyy-MM-dd}", Ct);

        Assert.DoesNotContain("count", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("players", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("answers", body, StringComparison.OrdinalIgnoreCase);
        Assert.All(gamers, g => Assert.DoesNotContain(g.Id.ToString(), body, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task MoinsDe5Joueurs_LesMorceauxSansStatistiques()
    {
        await SeedDayAsync(Yesterday, players: 4);

        var day = await DayAsync(Yesterday);

        Assert.False(day.HasStats);
        Assert.Equal((null, null, null), (day.MedianScore, day.MinScore, day.MaxScore));
        Assert.Empty(day.ScoreDistribution);
        Assert.Equal(5, day.Tracks.Count);
        Assert.All(day.Tracks, t => Assert.Equal((null, null, null, 0), (t.ArtistFoundPercent, t.TitleFoundPercent, t.NotFoundPercent, t.GuessSteps.Count)));
    }

    [Fact]
    public async Task LeJourMeme_PasDeDefi_DateMalEcrite_404()
    {
        await _game.GenerateAsync();
        await _game.App.AddChallengeAsync(Today.AddDays(1), 1, 2, 3, 4, 5);
        var client = _game.Api.CreateClient();

        foreach (var path in new[] { $"{Today:yyyy-MM-dd}", $"{Today.AddDays(1):yyyy-MM-dd}", $"{Yesterday:yyyy-MM-dd}", "2026-13-01", "hier" })
        {
            var response = await client.GetAsync($"/api/daily/archive/{path}", Ct);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Contains(DailyErrorCodes.ArchiveNotAvailable, await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/daily/archive/{path}/me", Ct)).StatusCode);
        }
    }

    [Fact]
    public async Task LaListe_DesJoursPublies_EtLesFleches()
    {
        await SeedDayAsync(Today.AddDays(-5), players: 1);
        await _game.App.AddChallengeAsync(Frozen, 6, 7, 8, 9, 10);
        await _game.App.AddChallengeAsync(Yesterday, 11, 12, 13, 14, 15);
        await _game.GenerateAsync();

        var index = (await _game.Api.CreateClient().GetFromJsonAsync<ArchiveIndexResponse>("/api/daily/archive", Ct))!;
        var middle = await DayAsync(Frozen);

        Assert.Equal([Yesterday, Frozen, Today.AddDays(-5)], index.Dates);
        Assert.Equal((Today.AddDays(-5), Yesterday), (middle.PreviousDate!.Value, middle.NextDate!.Value));
        Assert.Null((await DayAsync(Today.AddDays(-5))).PreviousDate);
    }

    [Fact]
    public async Task Moi_SaPartieDuJour_JamaisEnCache()
    {
        var gamers = await SeedDayAsync(Yesterday, players: 5);

        var response = await gamers[0].Client.GetAsync($"/api/daily/archive/{Yesterday:yyyy-MM-dd}/me", Ct);
        var me = (await response.Content.ReadFromJsonAsync<ArchiveMeResponse>(Ct))!;

        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.Equal((true, 4250, 100), (me.Played, me.Score, me.BetterThanPercent));
        Assert.Equal([1, 2, 3, 4, 5], me.Answers.Select(a => a.Position));
        Assert.Equal((true, true, 1m, 850), (me.Answers[0].ArtistCorrect, me.Answers[0].TitleCorrect, me.Answers[0].ListenedSeconds, me.Answers[0].Score));
        Assert.Equal(0, (await MeAsync(Yesterday, gamers[1].Client)).BetterThanPercent);
    }

    [Fact]
    public async Task Moi_SousLeSeuil_SesReponsesSansPourcentage()
    {
        var gamers = await SeedDayAsync(Frozen, players: 2);
        await FreezeAsync(Frozen);

        var me = await MeAsync(Frozen, gamers[1].Client);

        Assert.Equal((true, 2200, (int?)null, 5), (me.Played, me.Score, me.BetterThanPercent, me.Answers.Count));
    }

    [Fact]
    public async Task Moi_SansCookie_NiPartie_RienEtAucunJoueurCree()
    {
        await SeedDayAsync(Yesterday, players: 5);
        var before = await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.players");

        var response = await _game.Api.CreateClient().GetAsync($"/api/daily/archive/{Yesterday:yyyy-MM-dd}/me", Ct);
        var anonymous = (await response.Content.ReadFromJsonAsync<ArchiveMeResponse>(Ct))!;
        var stranger = await MeAsync(Yesterday, (await _game.NewPlayerAsync()).Client);

        Assert.Equal((false, null, 0), (anonymous.Played, anonymous.Score, anonymous.Answers.Count));
        Assert.False(response.Headers.Contains("Set-Cookie"));
        Assert.Equal(before, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.players") - 1);
        Assert.False(stranger.Played);
    }

    [Fact]
    public async Task Moi_PartieAbandonnee_RienAMontrer()
    {
        await SeedDayAsync(Yesterday, players: 5);
        var quitter = await _game.NewPlayerAsync();
        await _game.AddSessionAsync(quitter.Id, Yesterday, 2, (1m, true, true, false, 850));

        Assert.False((await MeAsync(Yesterday, quitter.Client)).Played);
    }

    [Fact]
    public async Task Extrait_UneAdresseNeuve_JamaisEnCache_AucunJoueurCree()
    {
        await SeedDayAsync(Frozen, players: 1);
        var before = await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.players");

        var response = await _game.Api.CreateClient().GetAsync($"/api/daily/archive/{Frozen:yyyy-MM-dd}/tracks/2/preview", Ct);
        var preview = (await response.Content.ReadFromJsonAsync<ArchivePreviewResponse>(Ct))!;

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.StartsWith("http", preview.PreviewUrl);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.False(response.Headers.Contains("Set-Cookie"));
        Assert.Equal(before, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
    }

    [Theory]
    [InlineData(9_000_000_001L)] // Deezer répond « pas d'extrait »
    [InlineData(7_000_000_001L)] // Deezer répond « quota dépassé »
    public async Task Extrait_SansExtraitUtilisable_AdresseVide(long deezerId)
    {
        await SeedDayAsync(Yesterday, players: 1);
        await _game.Api.ExecuteAsync($"UPDATE catalogue.tracks SET deezer_track_id = {deezerId} WHERE id = 3");

        var preview = await _game.Api.CreateClient().GetFromJsonAsync<ArchivePreviewResponse>($"/api/daily/archive/{Yesterday:yyyy-MM-dd}/tracks/3/preview", Ct);

        Assert.Null(preview!.PreviewUrl);
    }

    [Fact]
    public async Task Extrait_LeJourMeme_PositionInconnue_404()
    {
        await _game.GenerateAsync();
        await SeedDayAsync(Yesterday, players: 1);
        var client = _game.Api.CreateClient();

        foreach (var path in new[] { $"{Today:yyyy-MM-dd}/tracks/1", $"{Yesterday:yyyy-MM-dd}/tracks/6", $"{Frozen:yyyy-MM-dd}/tracks/1", "hier/tracks/1" })
        {
            var response = await client.GetAsync($"/api/daily/archive/{path}/preview", Ct);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Contains(DailyErrorCodes.ArchiveNotAvailable, await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task PlanDuSite_PagesFixesPuisJoursPublies()
    {
        await _game.App.AddChallengeAsync(Frozen, 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Yesterday, 6, 7, 8, 9, 10);
        await _game.GenerateAsync();

        var response = await _game.Api.CreateClient().GetAsync("/sitemap.xml", Ct);
        var xml = XDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/xml", response.Content.Headers.ContentType?.MediaType);
        var front = _game.Api.Services.GetRequiredService<IOptions<AppOptions>>().Value;
        Assert.Equal(
            [front.Link("/daily"), front.Link("/privacy"), front.Link($"/daily/archive/{Yesterday:yyyy-MM-dd}"), front.Link($"/daily/archive/{Frozen:yyyy-MM-dd}")],
            xml.Root!.Elements(ns + "url").Select(u => u.Element(ns + "loc")!.Value));
    }
}
