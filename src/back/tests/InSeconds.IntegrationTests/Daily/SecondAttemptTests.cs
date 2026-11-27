using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// La seconde tentative : une réponse non complète ne se corrige pas devant le joueur, il a <b>une</b> tentative de plus, définitive, au prix
/// du dernier palier écouté multiplié par <c>Daily:RetryScorePercent</c> (piège 51).
/// </summary>
public class SecondAttemptTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;
    private Gamer _alice = null!;
    private int _session;
    private int _trackId;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(
            await postgres.CreateDatabaseAsync(), settings: new Dictionary<string, string> { ["Daily:RetryScorePercent"] = "70" });
        _alice = await _game.NewPlayerAsync();
        await _game.GenerateAsync();
        _session = (await _alice.StartAsync()).SessionId;
        _trackId = await _game.TrackAtAsync(Today, 1);
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    [Fact]
    public async Task Piege51_ReponseNonComplete_AucunVerdict_RienDeRevele_RienDEnregistre()
    {
        // L'artiste est juste, le titre faux : aucune moitié ne doit se deviner.
        var retry = await ReadAsync(await _alice.AnswerAsync(_session, 1, 2, $"Artiste {_trackId}", "Yyyy"));

        Assert.True(retry.Retry);
        Assert.Equal((false, false, 0), (retry.ArtistCorrect, retry.TitleCorrect, retry.Score));
        Assert.Equal((string.Empty, string.Empty, 0L, null), (retry.CorrectArtist, retry.CorrectTitle, retry.DeezerTrackId, retry.CoverUrl));
        Assert.False(retry.Completed);
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
    }

    [Fact]
    public async Task Piege51_LaReponseRatee_EtLaReponseToutFausse_SeRessemblent()
    {
        var half = await ReadAsync(await _alice.AnswerAsync(_session, 1, 2, $"Artiste {_trackId}", "Yyyy"));
        var bob = await _game.NewPlayerAsync();
        var bobSession = (await bob.StartAsync()).SessionId;
        var wrong = await ReadAsync(await bob.AnswerAsync(bobSession, 1, 2, "Zzzz", "Yyyy"));

        // Même réponse, octet pour octet : on n'apprend rien de plus d'une moitié juste que de deux fausses.
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(half), System.Text.Json.JsonSerializer.Serialize(wrong));
    }

    [Fact]
    public async Task SecondeTentative_Reussie_LePrixDuPalier_FoisLePourcentage()
    {
        await _alice.AnswerAsync(_session, 1, 2, "Zzzz", "Yyyy");

        var final = await ReadAsync(await _alice.AnswerAsync(_session, 1, 2, $"Artiste {_trackId}", $"Titre {_trackId}"));

        Assert.False(final.Retry);
        Assert.Equal(385, final.Score); // 550 × 0,7
        Assert.Equal((true, true), (final.ArtistCorrect, final.TitleCorrect));
        Assert.Equal($"Artiste {_trackId}", final.CorrectArtist);
    }

    [Fact]
    public async Task SecondeTentative_ApresUnePlusLongueEcoute_LePrixDuDernierPalier()
    {
        // Tentative à 0,5 s, puis écoute jusqu'à 5 s : 250 × 0,7, jamais 1000.
        await _alice.AnswerAsync(_session, 1, 0.5m, "Zzzz", "Yyyy");
        await _alice.ListenAsync(_session, 1, 5);

        var final = await ReadAsync(await _alice.AnswerAsync(_session, 1, 5, $"Artiste {_trackId}", $"Titre {_trackId}"));

        Assert.Equal(175, final.Score);
        Assert.Equal(5m, final.ListenedSeconds);
    }

    [Fact]
    public async Task SecondeTentative_UneMoitieJuste_LaMoitie_PuisLePourcentage()
    {
        await _alice.AnswerAsync(_session, 1, 5, "Zzzz", "Yyyy");

        var final = await ReadAsync(await _alice.AnswerAsync(_session, 1, 5, $"Artiste {_trackId}", "Yyyy"));

        // 250 × 0,5 = 125 ; 125 × 0,7 = 87,5 → 88 (l'arrondi du serveur).
        Assert.Equal((false, 88), (final.Retry, final.Score));
        Assert.Equal((true, false), (final.ArtistCorrect, final.TitleCorrect));
    }

    [Fact]
    public async Task SecondeTentative_Ratee_EstDefinitive_ZeroPoint_PasDeTroisiemeEssai()
    {
        await _alice.AnswerAsync(_session, 1, 1, "Zzzz", "Yyyy");

        var final = await ReadAsync(await _alice.AnswerAsync(_session, 1, 1, "Xxxx", "Wwww"));

        Assert.Equal((false, 0), (final.Retry, final.Score));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
    }

    [Fact]
    public async Task SecondeTentative_LePalierAnnonceNePeutPasDescendre_400()
    {
        await _alice.AnswerAsync(_session, 1, 5, "Zzzz", "Yyyy");

        var response = await _alice.AnswerAsync(_session, 1, 0.5m, $"Artiste {_trackId}", $"Titre {_trackId}");

        await GameAsserts.ProblemAsync(response, HttpStatusCode.BadRequest, "daily.listened_duration_below_verified_minimum");
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
    }

    [Fact]
    public async Task ReponseComplete_PremiereTentative_AucuneReduction()
    {
        var answer = await ReadAsync(await _alice.AnswerAsync(_session, 1, 2, $"Artiste {_trackId}", $"Titre {_trackId}"));

        Assert.Equal((false, 550), (answer.Retry, answer.Score));
    }

    [Fact]
    public async Task Passer_OuChampVide_EstDefinitif_PasDeSecondeTentative()
    {
        var passed = await ReadAsync(await _alice.AnswerAsync(_session, 1, 2, null, null));
        var blank = await ReadAsync(await _alice.AnswerAsync(_session, 2, 2, "  ", ""));

        Assert.Equal((false, 0), (passed.Retry, passed.Score));
        Assert.Equal((false, 0), (blank.Retry, blank.Score));
        Assert.Equal(2L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));
    }

    [Fact]
    public async Task MorceauSansExtrait_Palier0_PasDeSecondeTentative()
    {
        var answer = await ReadAsync(await _alice.AnswerAsync(_session, 1, 0, "Zzzz", "Yyyy"));

        Assert.False(answer.Retry);
    }

    [Fact]
    public async Task MorceauSuivant_RepartAPremiereTentative()
    {
        await _alice.AnswerAsync(_session, 1, 1, "Zzzz", "Yyyy");
        await _alice.AnswerAsync(_session, 1, 1, "Xxxx", "Wwww");

        var next = await ReadAsync(await _alice.AnswerAsync(_session, 2, 1, "Zzzz", "Yyyy"));

        Assert.True(next.Retry);
    }

    [Fact]
    public async Task Reprise_RouvreLaSecondeTentative_EtLePlancherGardeLePalier()
    {
        await _alice.AnswerAsync(_session, 1, 3, "Zzzz", "Yyyy");

        var resumed = await _alice.StartAsync();

        Assert.Equal(1, resumed.CurrentTrack!.FailedAttempts);
        Assert.Equal(3m, resumed.CurrentTrack.ListenedSeconds);
    }

    [Fact]
    public async Task Reprise_SansTentativeRatee_ZeroTentative()
    {
        await _alice.ListenAsync(_session, 1, 2);

        var resumed = await _alice.StartAsync();

        Assert.Equal(0, resumed.CurrentTrack!.FailedAttempts);
    }

    [Fact]
    public async Task IndiceEtSecondeTentative_LesDeuxPenalitesSAppliquent()
    {
        await _alice.ListenAsync(_session, 1, 5);
        await _alice.HintAsync(_session, 1, 1); // −30 %
        await _alice.AnswerAsync(_session, 1, 5, "Zzzz", "Yyyy");

        var final = await ReadAsync(await _alice.AnswerAsync(_session, 1, 5, $"Artiste {_trackId}", $"Titre {_trackId}"));

        // 250 × 0,7 = 175 ; 175 × 0,7 = 122,5 → 122.
        Assert.Equal(122, final.Score);
        Assert.Equal(1, final.HintLevelUsed);
    }

    [Fact]
    public async Task ReglageAZero_PasDeSecondeTentative_LaCorrectionEstImmediate()
    {
        await _game.SetSettingAsync("Daily:RetryScorePercent", "0");

        var answer = await ReadAsync(await _alice.AnswerAsync(_session, 1, 2, $"Artiste {_trackId}", "Yyyy"));

        Assert.Equal((false, true, false, 275), (answer.Retry, answer.ArtistCorrect, answer.TitleCorrect, answer.Score));
    }

    [Fact]
    public async Task Reglage_ExposeAuFront()
    {
        var settings = (await _game.Api.CreateClient().GetFromJsonAsync<DailySettingsResponse>("/api/daily/settings", TestContext.Current.CancellationToken))!;

        Assert.Equal(70, settings.RetryScorePercent);
    }

    private static async Task<SubmitAnswerResponse> ReadAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SubmitAnswerResponse>(TestContext.Current.CancellationToken))!;
    }
}
