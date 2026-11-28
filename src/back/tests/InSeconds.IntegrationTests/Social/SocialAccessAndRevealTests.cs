using System.Net.Http.Json;
using System.Text.Json;
using InSeconds.Api.Modules.Social.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Social;

/// <summary>
/// Ce que les classements d'un groupe supposent, ou taisent, du joueur qui les lit : l'accès Survie ne conditionne pas le classement d'un groupe (celui du
/// Défi du jour, ouvert à tout compte), et rien de ce qu'ils rendent ne permet de deviner un morceau avant la réponse (piège 31).
/// </summary>
public class SocialAccessAndRevealTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateOnly Today = DailyApi.Today;
    private GameApi _game = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 50);
        await _game.GenerateAsync(Today.AddDays(-1));
        await _game.GenerateAsync(Today);
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    /// <summary>Alice (sans l'accès Survie) crée le groupe, Bob (avec l'accès) et Carol (sans) le rejoignent.</summary>
    private async Task<(Gamer Alice, Gamer Bob, Gamer Carol, GroupSummaryResponse Group)> GroupAsync()
    {
        var (alice, bob, carol) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"), await _game.NewPlayerAsync("Carol"));
        await _game.Api.ExecuteAsync($"INSERT INTO runs.access (player_id, granted_at) VALUES ('{bob.Id}', now())");
        var response = await alice.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup("Les copains"), Ct);
        var group = (await response.Content.ReadFromJsonAsync<GroupSummaryResponse>(Ct))!;
        await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);
        await carol.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);
        return (alice, bob, carol, group);
    }

    private Task AddGameAsync(Gamer gamer, int daysAgo, int score) =>
        _game.AddSessionAsync(gamer.Id, Today.AddDays(-daysAgo), 1, (2m, true, true, false, score));

    private static async Task<ModeScoresResponse> ScoresAsync(Gamer gamer, GroupSummaryResponse group) =>
        Assert.Single((await gamer.Client.GetFromJsonAsync<GroupScoresResponse>($"/api/social/groups/{group.Id}/scores", Ct))!.Modes);

    [Fact]
    public async Task UnMembreSansAccesSurvie_VoitLeClassementDeSonGroupe_CommeUnMembreQuiAL_Acces()
    {
        var (alice, bob, carol, group) = await GroupAsync();
        await AddGameAsync(alice, 0, 600);
        await AddGameAsync(bob, 0, 900);
        await AddGameAsync(bob, 1, 100);
        // Le point de départ du test : Alice et Carol n'ont pas l'accès, Bob l'a.
        Assert.Equal(1, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM runs.access"));
        Assert.Equal(0, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.access WHERE player_id IN ('{alice.Id}', '{carol.Id}')"));

        var withoutAccess = await ScoresAsync(alice, group);
        var withAccess = await ScoresAsync(bob, group);

        Assert.True(withoutAccess.TodayRevealed);
        Assert.Equal(["Bob", "Alice", "Carol"], withoutAccess.Today.Select(e => e.Pseudo));
        Assert.Equal([900, 600, null], withoutAccess.Today.Select(e => e.Score));
        Assert.Equal(["Bob", "Alice", "Carol"], withoutAccess.Week.Select(e => e.Pseudo));
        Assert.Equal([1000, 600, null], withoutAccess.Week.Select(e => e.Points));
        // Le même classement, vu par l'un ou l'autre : seul « c'est moi » change.
        Assert.Equal(withAccess.Today.Select(e => (e.Rank, e.Pseudo, e.Played, e.Score)), withoutAccess.Today.Select(e => (e.Rank, e.Pseudo, e.Played, e.Score)));
        Assert.Equal(withAccess.Week.Select(e => (e.Rank, e.Pseudo, e.Points, e.PlayedDays.Count)), withoutAccess.Week.Select(e => (e.Rank, e.Pseudo, e.Points, e.PlayedDays.Count)));
        Assert.Equal([false, true, false], withoutAccess.Today.Select(e => e.IsMe));

        // Le jour de la veille, et le détail du groupe, ne demandent pas l'accès non plus.
        var yesterday = (await alice.Client.GetFromJsonAsync<GroupDayScoresResponse>($"/api/social/groups/{group.Id}/scores/{Today.AddDays(-1):yyyy-MM-dd}", Ct))!;
        var day = Assert.Single(yesterday.Modes);
        Assert.True(day.Revealed);
        Assert.Equal([100, null, null], day.Entries.Select(e => e.Score));
        var detail = (await alice.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!;
        Assert.Equal(["Alice", "Bob", "Carol"], detail.Members.Select(m => m.Pseudo).Order());
        var ranking = (await alice.Client.GetFromJsonAsync<GroupRankingResponse>($"/api/social/groups/{group.Id}/ranking", Ct))!;
        Assert.Equal(["Alice", "Bob", "Carol"], ranking.Entries.Select(e => e.Pseudo).Order());
    }

    // Les noms des champs que le classement d'un groupe a le droit de rendre : un champ de plus (un titre, un identifiant de morceau, une pochette)
    // casse ce test, et c'est voulu.
    private static readonly HashSet<string> ScoresFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "groupId", "name", "modes", "mode", "day", "todayRevealed", "weekDays", "today", "week", "rank", "pseudo", "isMe", "played", "score", "points", "playedDays",
        "revealed", "entries",
    };

    private static IEnumerable<string> FieldNames(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.Object => element.EnumerateObject().SelectMany(p => FieldNames(p.Value).Prepend(p.Name)),
        JsonValueKind.Array => element.EnumerateArray().SelectMany(FieldNames),
        _ => [],
    };

    private static async Task<IReadOnlyList<string>> UnknownFieldsAsync(Gamer gamer, params string[] urls)
    {
        var unknown = new List<string>();
        foreach (var url in urls)
        {
            var body = await gamer.Client.GetStringAsync(url, Ct);
            unknown.AddRange(FieldNames(JsonDocument.Parse(body).RootElement).Where(name => !ScoresFields.Contains(name)).Select(name => $"{url} : {name}"));
        }

        return unknown;
    }

    [Fact]
    public async Task Piege31_LeClassementDuGroupe_NeDitJamaisLesMorceauxNiLesReponses_NiAvantNiApresLaFinDeSaPartie()
    {
        var (alice, bob, _, group) = await GroupAsync();
        await AddGameAsync(bob, 0, 900);
        var urls = new[] { $"/api/social/groups/{group.Id}/scores", $"/api/social/groups/{group.Id}/scores/{Today:yyyy-MM-dd}" };

        // Alice a commencé sa partie sans la finir : elle voit qui a joué, mais ni le score de Bob, ni le moindre champ d'un morceau.
        var session = (await alice.StartAsync()).SessionId;
        Assert.Empty(await UnknownFieldsAsync(alice, urls));
        var during = await ScoresAsync(alice, group);
        Assert.False(during.TodayRevealed);
        Assert.All(during.Today, e => Assert.Null(e.Score));
        Assert.All(during.Today, e => Assert.Null(e.Rank));
        Assert.All(during.Week, e => Assert.Null(e.Points));
        var dayDuring = Assert.Single((await alice.Client.GetFromJsonAsync<GroupDayScoresResponse>(urls[1], Ct))!.Modes);
        Assert.False(dayDuring.Revealed);
        Assert.All(dayDuring.Entries, e => Assert.Null(e.Score));

        // Une fois finie, les scores s'ouvrent, et les champs restent les mêmes : un score, jamais un morceau.
        await alice.AnswerCorrectlyAsync(session, 1, 1);
        await alice.FinishAsync(session, fromPosition: 2, day: Today);
        Assert.Empty(await UnknownFieldsAsync(alice, urls));
        var after = await ScoresAsync(alice, group);
        Assert.True(after.TodayRevealed);
        Assert.Equal(900, after.Today.Single(e => e.Pseudo == "Bob").Score);
    }
}
