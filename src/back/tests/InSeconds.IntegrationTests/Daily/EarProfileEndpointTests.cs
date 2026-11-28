using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le profil d'oreille (<c>GET /api/daily/profile</c>) : les chiffres du joueur dans la durée, comparés à tous les joueurs seulement au-dessus des
/// seuils ; jamais les parties d'un autre.
/// </summary>
public class EarProfileEndpointTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 60);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static async Task<EarProfileResponse> ProfileAsync(Gamer gamer, string query = "") =>
        (await gamer.Client.GetFromJsonAsync<EarProfileResponse>($"/api/daily/profile{query}", Ct))!;

    [Fact]
    public async Task SesChiffres_SurHuitSemaines()
    {
        var gamer = await _game.NewPlayerAsync();
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-3), 6, 7, 8, 9, 10);
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-1), 1,
            (0.5m, true, true, false, 1000), (0.5m, true, false, false, 700), (2m, false, true, false, 300), (2m, false, false, false, 0), (1m, true, true, false, 850));
        await _game.AddSessionAsync(gamer.Id, Today.AddDays(-3), 1, (1m, true, true, false, 1000));
        await _game.SetStreakAsync(gamer.Id, 2, Today.AddDays(-1), 0);
        await _game.Api.ExecuteAsync($"UPDATE daily.streaks SET best_streak = 9 WHERE player_id = '{gamer.Id}'");

        var profile = await ProfileAsync(gamer);

        Assert.Equal("8w", profile.Period);
        Assert.Equal(8, profile.Points.Count);
        Assert.Equal(2, profile.Points.Sum(p => p.Games));
        // (2850 + 1000) / 2
        Assert.Equal((2, (int?)2850, (int?)1925, 9), (profile.GamesPlayed, profile.BestScore, profile.AverageScore, profile.BestStreak));
        Assert.Equal((0.5m, 2), (profile.FirstStepSeconds, profile.FirstStepFound));
        // 6 réponses : 4 artistes, 4 titres, 1 rien trouvé.
        Assert.Equal(((int?)67, (int?)67, (int?)17), (profile.ArtistFoundPercent, profile.TitleFoundPercent, profile.NotFoundPercent));
        Assert.Equal(33, profile.Steps.Single(s => s.Seconds == 0.5m).Percent);
        // Moins de 100 réponses et de 5 parties chez les joueurs : aucune comparaison.
        Assert.All(profile.Steps, s => Assert.Null(s.PlayersPercent));
        Assert.Null(profile.PlayersArtistFoundPercent);
        Assert.All(profile.Points, p => Assert.Null(p.PlayersAverage));
    }

    [Fact]
    public async Task LesJoueurs_AuDessusDesSeuils_EtJamaisLesPartiesDUnAutre()
    {
        var gamer = await _game.NewPlayerAsync();
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        var others = new List<Gamer>();
        for (var i = 0; i < 20; i++)
        {
            var other = await _game.NewPlayerAsync($"Autre{i}");
            others.Add(other);
            await _game.AddSessionAsync(other.Id, Today.AddDays(-1), 1, [.. Enumerable.Repeat((1m, true, false, false, 400), 5)]);
        }

        var profile = await ProfileAsync(gamer);

        // Lui n'a rien joué ; les 100 réponses des autres donnent les comparaisons, sans toucher à ses chiffres.
        Assert.Equal((0, (int?)null, (int?)null), (profile.GamesPlayed, profile.BestScore, profile.ArtistFoundPercent));
        Assert.Equal(((int?)100, (int?)0), (profile.PlayersArtistFoundPercent, profile.PlayersTitleFoundPercent));
        Assert.Equal(100, profile.Steps.Single(s => s.Seconds == 1m).PlayersPercent);
        Assert.Equal(2000, profile.Points.Single(p => p.PlayersAverage is not null).PlayersAverage);
        var body = await gamer.Client.GetStringAsync("/api/daily/profile", Ct);
        Assert.DoesNotContain(others[0].Id.ToString(), body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SixMoisEtDepuisLeDebut_UnPointParMois()
    {
        var gamer = await _game.NewPlayerAsync();
        await _game.App.AddChallengeAsync(new DateOnly(2026, 4, 10), 1, 2, 3, 4, 5);
        await _game.AddSessionAsync(gamer.Id, new DateOnly(2026, 4, 10), 1, (1m, true, true, false, 900));

        var sixMonths = await ProfileAsync(gamer, "?period=6m");
        var all = await ProfileAsync(gamer, "?period=all");

        Assert.Equal(6, sixMonths.Points.Count);
        Assert.Equal(0, sixMonths.GamesPlayed);
        Assert.Equal([4, 5, 6, 7, 8, 9, 10], all.Points.Select(p => p.Start.Month));
        Assert.Equal((1, (int?)900), (all.GamesPlayed, all.Points[0].Average));
    }

    [Fact]
    public async Task PeriodeInconnue_400_PasDIdentite_401()
    {
        var gamer = await _game.NewPlayerAsync();

        await GameAsserts.ProblemAsync(await gamer.Client.GetAsync("/api/daily/profile?period=1y", Ct), HttpStatusCode.BadRequest, DailyErrorCodes.InvalidPeriod);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync("/api/daily/profile", Ct)).StatusCode);
    }
}
