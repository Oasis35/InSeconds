using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le bilan de la semaine passée (<c>GET /api/daily/week-review</c>) : sept scores du lundi au dimanche, jours joués, moyenne, meilleur jour et
/// meilleur morceau, sur les seules parties terminées du joueur et la date du défi (piège 18). `Today` est un lundi : la semaine lue est celle
/// d'avant (28/09 au 04/10).
/// </summary>
public class WeekReviewTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly Monday = Today.AddDays(-7);

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 80);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static async Task<WeekReviewResponse> ReviewAsync(Gamer gamer) =>
        (await gamer.Client.GetFromJsonAsync<WeekReviewResponse>("/api/daily/week-review", Ct))!;

    private async Task ChallengeAsync(DateOnly day, int firstTrack) =>
        await _game.App.AddChallengeAsync(day, firstTrack, firstTrack + 1, firstTrack + 2, firstTrack + 3, firstTrack + 4);

    [Fact]
    public async Task LaSemaineDerniere_DonneSesScores_SaMoyenne_SonMeilleurJour_EtSonMeilleurMorceau()
    {
        var gamer = await _game.NewPlayerAsync();
        await ChallengeAsync(Monday, 1);
        await ChallengeAsync(Monday.AddDays(1), 6);
        await ChallengeAsync(Monday.AddDays(2), 11);
        await _game.AddSessionAsync(gamer.Id, Monday, 1, (1m, true, true, false, 850), (2m, true, true, false, 600), (2m, false, false, false, 0));
        await _game.AddSessionAsync(gamer.Id, Monday.AddDays(1), 1, (1m, true, true, false, 900), (3m, true, true, false, 500));
        // Abandonnée : ni score ni jour joué.
        await _game.AddSessionAsync(gamer.Id, Monday.AddDays(2), 2, (1m, true, true, false, 850));

        var review = await ReviewAsync(gamer);

        Assert.Equal(Monday, review.WeekStart);
        Assert.Equal(7, review.Days.Count);
        Assert.Equal([1450, 1400], review.Days.Where(d => d.Score is not null).Select(d => d.Score!.Value));
        Assert.Equal((2, (int?)1425, (DateOnly?)Monday, (int?)1450), (review.PlayedCount, review.AverageScore, review.BestDay, review.BestScore));
        Assert.Equal(Monday.AddDays(1), review.BestTrack!.Date);
        Assert.Equal(900, review.BestTrack.Score);
        Assert.False(string.IsNullOrWhiteSpace(review.BestTrack.Artist));
    }

    [Fact]
    public async Task SansPartieTerminee_RienATrouver_PasDeMeilleurMorceau()
    {
        var gamer = await _game.NewPlayerAsync();
        await ChallengeAsync(Monday, 1);

        var review = await ReviewAsync(gamer);

        Assert.Equal((0, (int?)null, (int?)null, (DateOnly?)null), (review.PlayedCount, review.AverageScore, review.BestScore, review.BestDay));
        Assert.Null(review.BestTrack);
        Assert.All(review.Days, d => Assert.Null(d.Score));
    }

    [Fact]
    public async Task LeBilan_NeLitQueLesPartiesDuJoueur_EtPasLaSemaineEnCours()
    {
        var gamer = await _game.NewPlayerAsync();
        var other = await _game.NewPlayerAsync();
        await ChallengeAsync(Monday, 1);
        await ChallengeAsync(Today, 6);
        await _game.AddSessionAsync(other.Id, Monday, 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(gamer.Id, Today, 1, (1m, true, true, false, 850));

        var review = await ReviewAsync(gamer);

        Assert.Equal(0, review.PlayedCount);
        Assert.Null(review.BestTrack);
    }
}
