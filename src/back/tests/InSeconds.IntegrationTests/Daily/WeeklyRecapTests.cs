using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>Le récap de la semaine pour les stories Instagram de l'admin (E3) : le morceau le plus trouvé et le plus raté d'une période.</summary>
public class WeeklyRecapTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/admin/daily/weekly-recap";

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<HttpResponseMessage> GetAsync(string query = "") => await _game.App.Admin().GetAsync(Route + query, Ct);

    private async Task<WeeklyRecapResponse> ReadAsync(string query = "")
    {
        var response = await GetAsync(query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WeeklyRecapResponse>(Ct))!;
    }

    /// <summary>
    /// Trois joueurs sur un défi des morceaux 1 à 5 : le morceau 1 (position 1) est trouvé en entier par tous, le morceau 2 par aucun, le 3 par un
    /// seul des trois, les positions 4 et 5 par deux.
    /// </summary>
    private async Task SeedAsync(DateOnly day, params Guid[] players)
    {
        await _game.App.AddChallengeAsync(day, 1, 2, 3, 4, 5);
        for (var i = 0; i < players.Length; i++)
        {
            (decimal, bool, bool, bool, int) Found(bool ok) => (1m, ok, ok, false, ok ? 850 : 0);
            await _game.AddSessionAsync(players[i], day, 1, Found(true), Found(false), Found(i == 0), Found(i < 2), Found(i < 2));
        }
    }

    private async Task<Guid[]> PlayersAsync(int count)
    {
        var ids = new List<Guid>();
        for (var i = 0; i < count; i++)
            ids.Add((await _game.NewPlayerAsync()).Id);
        return [.. ids];
    }

    [Fact]
    public async Task LePlusTrouveEtLePlusRate_ParDefautLesSeptDerniersJours()
    {
        await SeedAsync(Today, await PlayersAsync(3));

        var recap = await ReadAsync();

        Assert.Equal(("ok", Today.AddDays(-6), Today, 3), (recap.Status, recap.From, recap.To, recap.MinAnswers));
        Assert.Equal(("Artiste 1", "Titre 1", 100.0, 3), (recap.MostFound!.Artist, recap.MostFound.Title, recap.MostFound.SuccessRatePercent, recap.MostFound.Answers));
        Assert.Equal(("Artiste 2", "Titre 2", 0.0, 3), (recap.MostMissed!.Artist, recap.MostMissed.Title, recap.MostMissed.SuccessRatePercent, recap.MostMissed.Answers));
    }

    [Fact]
    public async Task SansAssezDeReponses_StatutInsuffisant_200()
    {
        await SeedAsync(Today, await PlayersAsync(2));

        var recap = await ReadAsync();

        Assert.Equal("insufficient_data", recap.Status);
        Assert.Null(recap.MostFound);
        Assert.Null(recap.MostMissed);
    }

    [Fact]
    public async Task SansRienDuTout_StatutInsuffisant()
    {
        Assert.Equal("insufficient_data", (await ReadAsync()).Status);
    }

    [Fact]
    public async Task LaPeriodeSeChoisit_LesJoursHorsPeriodeNeCompentPas()
    {
        var players = await PlayersAsync(3);
        await SeedAsync(Today.AddDays(-20), players);

        Assert.Equal("insufficient_data", (await ReadAsync()).Status);
        var recap = await ReadAsync($"?from={Today.AddDays(-25):yyyy-MM-dd}&to={Today.AddDays(-15):yyyy-MM-dd}");
        Assert.Equal("ok", recap.Status);
        Assert.Equal((Today.AddDays(-25), Today.AddDays(-15)), (recap.From, recap.To));
    }

    [Fact]
    public async Task UnMorceauQuiRevient_CumuleSesReponsesSurLaPeriode()
    {
        var players = await PlayersAsync(3);
        // Le morceau 1 est trouvé par les trois joueurs à sa première apparition, raté par les trois à la seconde ; le morceau 2, trouvé deux fois sur deux.
        await _game.App.AddChallengeAsync(Today.AddDays(-5), 1, 3, 4, 5, 6);
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 4, 5, 6);
        foreach (var player in players)
        {
            await _game.AddSessionAsync(player, Today.AddDays(-5), 1, (1m, true, true, false, 850));
            await _game.AddSessionAsync(player, Today.AddDays(-1), 1, (1m, false, false, false, 0), (1m, true, true, false, 850));
        }

        var recap = await ReadAsync();

        // Sur six réponses : trois pleinement justes. C'est le plus raté ; le morceau 2 (trois réponses justes) est le plus trouvé.
        Assert.Equal(("Artiste 1", 50.0, 6), (recap.MostMissed!.Artist, recap.MostMissed.SuccessRatePercent, recap.MostMissed.Answers));
        Assert.Equal(("Artiste 2", 100.0), (recap.MostFound!.Artist, recap.MostFound.SuccessRatePercent));
    }

    [Fact]
    public async Task UnJoueurSupprime_NeComptePlus()
    {
        var players = await PlayersAsync(3);
        await SeedAsync(Today, players);
        await _game.DeletePlayerAsync(players[2]);

        // Il ne reste que deux réponses par morceau : en dessous du minimum, plus de story.
        Assert.Equal("insufficient_data", (await ReadAsync()).Status);
    }

    [Fact]
    public async Task UnTitreRenomme_EstRenduNettoye()
    {
        await SeedAsync(Today, await PlayersAsync(3));
        await _game.App.Admin().PatchAsJsonAsync("/api/admin/catalogue/tracks/1", new { artist = "Daft Punk", title = "One More Time (Radio Edit)" }, Ct);

        var recap = await ReadAsync();

        Assert.Equal(("Daft Punk", "One More Time"), (recap.MostFound!.Artist, recap.MostFound.Title));
    }

    [Theory]
    [InlineData("?from=2026-9-1", "admin.invalid_date")]
    [InlineData("?to=hier", "admin.invalid_date")]
    [InlineData("?from=2026-10-05&to=2026-10-01", "admin.invalid_period")]
    [InlineData("?from=2024-01-01&to=2026-10-05", "admin.invalid_period")]
    public async Task PeriodeInvalide_400_CodeStable(string query, string code)
    {
        await GameAsserts.ProblemAsync(await GetAsync(query), HttpStatusCode.BadRequest, code);
    }

    [Fact]
    public async Task ReserveAUnAdmin_401Et403()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync(Route, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).GetAsync(Route, Ct)).StatusCode);
    }

    [Fact]
    public async Task AucunePochette_DansLaReponse_PiegeQuarenteSept()
    {
        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET cover_hash = 'abcdef0123456789'");
        await SeedAsync(Today, await PlayersAsync(3));

        var body = await (await GetAsync()).Content.ReadAsStringAsync(Ct);

        // Les stories sont des images publiées hors du site : Deezer interdit de stocker ses images.
        Assert.DoesNotContain("abcdef0123456789", body, StringComparison.Ordinal);
        Assert.DoesNotContain("cover", body, StringComparison.OrdinalIgnoreCase);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
