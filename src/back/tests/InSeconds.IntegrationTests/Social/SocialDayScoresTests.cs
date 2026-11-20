using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Social.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Social;

/// <summary>
/// Le classement d'un groupe sur le défi d'un jour (<c>GET /api/social/groups/{id}/scores/{date}</c>, « Tes amis ce jour-là » de l'historique) :
/// les parties terminées de ce jour-là, cachées tant que le joueur peut encore jouer ce défi ; un non-membre n'en voit rien.
/// </summary>
public class SocialDayScoresTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly Today = DailyApi.Today;
    private GameApi _game = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 50);
        foreach (var daysAgo in new[] { 0, 1, 3 })
            await _game.GenerateAsync(Today.AddDays(-daysAgo));
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<(Gamer Alice, Gamer Bob, Gamer Carol, GroupSummaryResponse Group)> GroupOfThreeAsync()
    {
        var (alice, bob, carol) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"), await _game.NewPlayerAsync("Carol"));
        var response = await alice.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup("Les copains"), Ct);
        var group = (await response.Content.ReadFromJsonAsync<GroupSummaryResponse>(Ct))!;
        await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);
        await carol.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);
        return (alice, bob, carol, group);
    }

    private Task AddGameAsync(Gamer gamer, int daysAgo, int score, short status = 1) =>
        _game.AddSessionAsync(gamer.Id, Today.AddDays(-daysAgo), status, (2m, true, true, false, score));

    private static async Task<ModeDayScoresResponse> DayOfAsync(Gamer gamer, GroupSummaryResponse group, DateOnly day)
    {
        var scores = (await gamer.Client.GetFromJsonAsync<GroupDayScoresResponse>($"/api/social/groups/{group.Id}/scores/{day:yyyy-MM-dd}", Ct))!;
        Assert.Equal((group.Id, "Les copains"), (scores.GroupId, scores.Name));
        return Assert.Single(scores.Modes);
    }

    [Fact]
    public async Task UnJourPasse_LesScoresDesMembres_LesAbsentsSansRang()
    {
        var (alice, bob, carol, group) = await GroupOfThreeAsync();
        await AddGameAsync(alice, 3, 600);
        await AddGameAsync(bob, 3, 900);
        // Une partie abandonnée n'a pas de score ; un autre jour ne compte pas.
        await AddGameAsync(carol, 3, 300, status: 2);
        await AddGameAsync(carol, 1, 5000);

        var day = await DayOfAsync(alice, group, Today.AddDays(-3));

        Assert.Equal(("daily", Today.AddDays(-3), true), (day.Mode, day.Day, day.Revealed));
        Assert.Equal(["Bob", "Alice", "Carol"], day.Entries.Select(e => e.Pseudo));
        Assert.Equal([1, 2, null], day.Entries.Select(e => e.Rank));
        Assert.Equal([900, 600, null], day.Entries.Select(e => e.Score));
        Assert.Equal([true, true, false], day.Entries.Select(e => e.Played));
        Assert.Equal([false, true, false], day.Entries.Select(e => e.IsMe));
    }

    [Fact]
    public async Task Piege18_LaVeilleEncoreEnCours_ResteCachee()
    {
        var (alice, bob, _, group) = await GroupOfThreeAsync();
        await AddGameAsync(bob, 1, 900);
        // Alice a commencé la veille sans la finir : elle peut encore la jouer après minuit.
        await AddGameAsync(alice, 1, 100, status: 0);

        var day = await DayOfAsync(alice, group, Today.AddDays(-1));

        Assert.False(day.Revealed);
        Assert.All(day.Entries, e => Assert.Equal((null, null, false), (e.Rank, e.Score, e.Played)));

        var forBob = await DayOfAsync(bob, group, Today.AddDays(-1));
        Assert.True(forBob.Revealed);
        Assert.Equal(900, forBob.Entries.Single(e => e.IsMe).Score);
    }

    [Fact]
    public async Task Aujourdhui_CacheTantQuIlNAPasFini()
    {
        var (alice, bob, _, group) = await GroupOfThreeAsync();
        await AddGameAsync(bob, 0, 900);

        Assert.False((await DayOfAsync(alice, group, Today)).Revealed);

        await AddGameAsync(alice, 0, 400);
        var day = await DayOfAsync(alice, group, Today);
        Assert.True(day.Revealed);
        Assert.Equal([900, 400, null], day.Entries.Select(e => e.Score));
    }

    [Fact]
    public async Task NonMembre_404_JamaisUnPseudo()
    {
        var (_, _, _, group) = await GroupOfThreeAsync();
        var stranger = await _game.NewPlayerAsync("Dave");

        var response = await stranger.Client.GetAsync($"/api/social/groups/{group.Id}/scores/{Today.AddDays(-3):yyyy-MM-dd}", Ct);

        await GameAsserts.ProblemAsync(response, HttpStatusCode.NotFound, SocialErrorCodes.GroupNotFound);
    }

    [Fact]
    public async Task JourFuturOuMalEcrit_400_SansIdentite_401()
    {
        var (alice, _, _, group) = await GroupOfThreeAsync();

        foreach (var date in new[] { Today.AddDays(1).ToString("yyyy-MM-dd"), "2026-02-30", "hier" })
            await GameAsserts.ProblemAsync(await alice.Client.GetAsync($"/api/social/groups/{group.Id}/scores/{date}", Ct), HttpStatusCode.BadRequest, SocialErrorCodes.InvalidDate);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync($"/api/social/groups/{group.Id}/scores/{Today:yyyy-MM-dd}", Ct)).StatusCode);
    }
}
