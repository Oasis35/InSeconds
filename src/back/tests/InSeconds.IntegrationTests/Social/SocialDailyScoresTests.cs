using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Social.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Social;

/// <summary>
/// Le classement par score d'un groupe, nourri par le Défi du jour (contrat <c>IMemberScoreSource</c>) : le jour, montré seulement à un joueur qui a
/// fini son défi, et la semaine glissante (somme des sept derniers jours, sur la date des défis) ; un non-membre n'en voit rien.
/// </summary>
public class SocialDailyScoresTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly Today = DailyApi.Today;
    private GameApi _game = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 50);
        foreach (var daysAgo in new[] { 0, 1, 3, 7 })
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

    /// <summary>Une partie posée en base sur le défi de ce jour, avec ce score total (une réponse par score).</summary>
    private Task AddGameAsync(Gamer gamer, int daysAgo, int score, short status = 1) =>
        _game.AddSessionAsync(gamer.Id, Today.AddDays(-daysAgo), status, (2m, true, true, false, score));

    private static async Task<ModeScoresResponse> DailyOfAsync(Gamer gamer, GroupSummaryResponse group)
    {
        var scores = (await gamer.Client.GetFromJsonAsync<GroupScoresResponse>($"/api/social/groups/{group.Id}/scores", Ct))!;
        Assert.Equal((group.Id, "Les copains"), (scores.GroupId, scores.Name));
        return Assert.Single(scores.Modes);
    }

    [Fact]
    public async Task ApresSonDefi_LeJourEtLaSemaine_UnJourManqueVautZero()
    {
        var (alice, bob, carol, group) = await GroupOfThreeAsync();
        await AddGameAsync(alice, 0, 600);
        await AddGameAsync(alice, 3, 400);
        await AddGameAsync(bob, 0, 900);
        await AddGameAsync(bob, 1, 50);
        // Il y a sept jours : hors de la semaine (le jour en cours et les six d'avant).
        await AddGameAsync(carol, 7, 5000);

        var daily = await DailyOfAsync(alice, group);

        Assert.Equal(("daily", Today, true, 7), (daily.Mode, daily.Day, daily.TodayRevealed, daily.WeekDays));
        Assert.Equal(["Bob", "Alice", "Carol"], daily.Today.Select(e => e.Pseudo));
        Assert.Equal([1, 2, null], daily.Today.Select(e => e.Rank));
        Assert.Equal([900, 600, null], daily.Today.Select(e => e.Score));
        Assert.Equal([true, true, false], daily.Today.Select(e => e.Played));
        Assert.Equal([false, true, false], daily.Today.Select(e => e.IsMe));

        Assert.Equal(["Alice", "Bob", "Carol"], daily.Week.Select(e => e.Pseudo));
        Assert.Equal([1, 2, null], daily.Week.Select(e => e.Rank));
        Assert.Equal([1000, 950, null], daily.Week.Select(e => e.Points));
        Assert.Equal([2, 2, 0], daily.Week.Select(e => e.PlayedDays.Count));
        // Les jours joués, pour les sept points de la semaine : du plus ancien au plus récent, sur la date des défis.
        Assert.Equal([[Today.AddDays(-3), Today], [Today.AddDays(-1), Today], []], daily.Week.Select(e => e.PlayedDays));
    }

    [Fact]
    public async Task AvantSonDefi_QuiAJoueSeulement_EtLaSemaineSArreteALaVeille()
    {
        var (alice, bob, carol, group) = await GroupOfThreeAsync();
        await AddGameAsync(bob, 0, 900);
        await AddGameAsync(bob, 1, 100);
        await AddGameAsync(carol, 0, 700);
        // Alice a commencé sa partie du jour sans la finir.
        await alice.StartAsync();

        var daily = await DailyOfAsync(alice, group);

        Assert.False(daily.TodayRevealed);
        Assert.All(daily.Today, e => Assert.Null(e.Rank));
        Assert.All(daily.Today, e => Assert.Null(e.Score));
        Assert.Equal([false, true, true], daily.Today.Select(e => e.Played));
        // Le jour en cours n'entre pas dans la semaine : rien ne trahit le score du jour de Bob ni de Carol.
        Assert.Equal(["Bob", "Alice", "Carol"], daily.Week.Select(e => e.Pseudo));
        Assert.Equal([100, null, null], daily.Week.Select(e => e.Points));
        Assert.Equal([1, 0, 0], daily.Week.Select(e => e.PlayedDays.Count));
        Assert.Equal([[Today.AddDays(-1)], [], []], daily.Week.Select(e => e.PlayedDays));

        // Bob, qui a fini, voit tout.
        var seenByBob = await DailyOfAsync(bob, group);
        Assert.True(seenByBob.TodayRevealed);
        Assert.Equal([900, 700, null], seenByBob.Today.Select(e => e.Score));
    }

    [Fact]
    public async Task AbandonneeOuExpiree_PasDeScore_MaisLAbandonApresUneReponseOuvreLeJour()
    {
        var (alice, bob, carol, group) = await GroupOfThreeAsync();
        await AddGameAsync(alice, 0, 300, status: 2);
        await AddGameAsync(bob, 0, 900);
        await AddGameAsync(carol, 1, 500, status: 3);

        var daily = await DailyOfAsync(alice, group);

        Assert.True(daily.TodayRevealed);
        Assert.Equal([900, null, null], daily.Today.Select(e => e.Score));
        Assert.Equal([true, false, false], daily.Today.Select(e => e.Played));
        Assert.Equal([900, null, null], daily.Week.Select(e => e.Points));
    }

    [Fact]
    public async Task AbandonneeSansReponse_LeJourResteFerme()
    {
        var (alice, bob, _, group) = await GroupOfThreeAsync();
        await _game.AddSessionAsync(alice.Id, Today, 2);
        await AddGameAsync(bob, 0, 900);

        var daily = await DailyOfAsync(alice, group);

        Assert.False(daily.TodayRevealed);
        Assert.All(daily.Today, e => Assert.Null(e.Score));
        Assert.All(daily.Week, e => Assert.Null(e.Points));
        Assert.All(daily.Week, e => Assert.Empty(e.PlayedDays));
    }

    [Fact]
    public async Task Piege18_PartieDeLaVeilleFinieApresMinuit_LaVeilleResteCacheeJusquALaFin_PuisCompteSurLaVeille()
    {
        var (alice, bob, _, group) = await GroupOfThreeAsync();
        await AddGameAsync(bob, 0, 800);
        // Alice commence avant minuit, répond au premier morceau, et finit après minuit.
        var session = (await alice.StartAsync()).SessionId;
        await alice.AnswerCorrectlyAsync(session, 1, 1);
        _game.Time.SetUtcNow(new DateTimeOffset(Today.AddDays(1).ToDateTime(new TimeOnly(0, 30)), TimeSpan.Zero));
        await _game.GenerateAsync(Today.AddDays(1));

        // Partie de la veille en cours : rien de la veille ne se voit, sinon la semaine de Bob trahirait son score d'un défi qu'Alice joue encore.
        var during = await DailyOfAsync(alice, group);
        Assert.Equal(Today.AddDays(1), during.Day);
        Assert.False(during.TodayRevealed);
        Assert.All(during.Week, e => Assert.Null(e.Points));
        Assert.All(during.Week, e => Assert.Empty(e.PlayedDays));

        await alice.FinishAsync(session, fromPosition: 2, day: Today);
        var after = await DailyOfAsync(alice, group);

        // Finie après minuit, elle compte pour la veille (date du défi), pas pour le jour en cours.
        Assert.All(after.Today, e => Assert.False(e.Played));
        var aliceWeek = after.Week.Single(e => e.IsMe);
        Assert.Single(aliceWeek.PlayedDays);
        Assert.Equal([Today], aliceWeek.PlayedDays);
        Assert.Equal(800, after.Week.Single(e => e.Pseudo == "Bob").Points);
    }

    [Fact]
    public async Task NonMembreEtInvite_404_JamaisUnScore()
    {
        var (alice, _, _, group) = await GroupOfThreeAsync();
        await AddGameAsync(alice, 0, 600);
        var stranger = await _game.NewPlayerAsync("Mallory");
        var guest = await _game.NewPlayerAsync();

        foreach (var outsider in new[] { stranger, guest })
        {
            var response = await outsider.Client.GetAsync($"/api/social/groups/{group.Id}/scores", Ct);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync(Ct);
            Assert.Contains("social.group_not_found", body, StringComparison.Ordinal);
            Assert.DoesNotContain("Alice", body, StringComparison.Ordinal);
        }
    }
}
