using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Runs.Application;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Les manches à thème (#536) : la playlist tire à sa création laquelle de ses manches 2 à 4 a un thème (ou aucune) ; le créateur choisit ce thème
/// juste avant de commencer la manche, parmi deux thèmes ou le thème mystère, et les morceaux de la manche sont alors tirés dans ce thème, figés pour
/// tous ses joueurs. Moins de trois thèmes assez fournis : aucun choix, aucune manche à thème.
/// </summary>
public class RunThemeApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly bool[] AllFound = [true, true, true, true, true];

    private RunGame _game = null!;
    private RunGamer _gamer = null!;

    /// <summary>
    /// 120 morceaux, trois thèmes de 40 morceaux (« Années 80 » 1 à 40, « Films » 41 à 80, « Rock » 81 à 120) et « Jazz », qui n'en a qu'un : trop peu
    /// pour une manche (5 plus 2 de réserve). Quoi que les autres manches aient pris, chaque thème en garde assez.
    /// </summary>
    public async ValueTask InitializeAsync()
    {
        _game = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 120);
        await _game.Api.ExecuteAsync("INSERT INTO catalogue.themes (id, name, created_at) VALUES (1, 'Années 80', now()), (2, 'Films', now()), (3, 'Rock', now()), (4, 'Jazz', now())");
        await _game.Api.ExecuteAsync("INSERT INTO catalogue.track_themes (track_id, theme_id) SELECT id, (id - 1) / 40 + 1 FROM catalogue.tracks WHERE id <= 120");
        await _game.Api.ExecuteAsync("INSERT INTO catalogue.track_themes (track_id, theme_id) VALUES (1, 4)");
        _gamer = await _game.NewInvitedAsync("Alice");
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private Task<long?> PendingRoundAsync(string code) =>
        _game.Api.ScalarAsync<long?>($"SELECT (rules ->> 'pendingThemeRound')::bigint FROM runs.challenges WHERE code = '{code}'");

    // Une playlist lancée dont la manche 2 attend son thème (le tirage de la manche est aléatoire : on le force pour le test).
    private async Task<(RunGamer Gamer, int Id, string Code)> LaunchPendingAsync(RunGamer? gamer = null)
    {
        gamer ??= _gamer;
        var start = (await gamer.LaunchAsync()).Session;
        await _game.Api.ExecuteAsync($"UPDATE runs.challenges SET rules = jsonb_set(rules, '{{pendingThemeRound}}', '2') WHERE code = '{start.ChallengeCode}'");
        return (gamer, start.SessionId, start.ChallengeCode);
    }

    private Task<HttpResponseMessage> ChooseThemeAsync(RunGamer gamer, int sessionId, int round, int? themeId) =>
        gamer.Client.PostAsJsonAsync($"/api/runs/sessions/{sessionId}/theme", new ChooseRunTheme(round, themeId), Ct);

    private static async Task<RunPlayResponse> ReadAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RunPlayResponse>(Ct))!;
    }

    [Fact]
    public async Task AvecTroisThemesFournis_LaPlaylistTireSaMancheATheme_ParmiLesManchesDeuxAQuatre_OuAucune()
    {
        var rounds = new HashSet<long?>();
        for (var i = 0; i < 24; i++)
        {
            var start = (await _gamer.LaunchAsync()).Session;
            rounds.Add(await PendingRoundAsync(start.ChallengeCode));
            // Rien ne dit le thème avant le choix : ni sur le lien, ni dans l'état de la partie (aucun thème choisi).
            Assert.Null(start.Themes);
        }

        Assert.All(rounds, r => Assert.Contains(r, new long?[] { null, 2, 3, 4 }));
        Assert.Contains(rounds, r => r is not null);
    }

    [Fact]
    public async Task SousTroisThemesAssezFournis_AucuneMancheATheme_JamaisDeChoix()
    {
        // « Films » perd ses morceaux : il ne reste que deux thèmes assez fournis.
        await _game.Api.ExecuteAsync("DELETE FROM catalogue.track_themes WHERE theme_id = 2");

        for (var i = 0; i < 12; i++)
        {
            var start = (await _gamer.LaunchAsync()).Session;
            Assert.Null(await PendingRoundAsync(start.ChallengeCode));
        }
    }

    [Fact]
    public async Task AvantLaMancheATheme_PasDeChoix_LaPremiereMancheNEnAJamais()
    {
        var (gamer, id, code) = await LaunchPendingAsync();

        Assert.Null((await gamer.SessionAsync(id)).ThemeChoice);
        var end = await gamer.PlayAsync(id, code, 1, AllFound);

        var choice = end.Session.ThemeChoice!;
        Assert.Equal(2, choice.Round);
        Assert.Equal(2, choice.Themes.Count);
        // Rien de la manche ne part avant les choix : ni extrait, ni difficulté.
        Assert.Null(end.Current);
        Assert.Null(end.Session.DifficultyChoice);
        Assert.Null((await gamer.ChallengeAsync(code)).Themes);
    }

    [Fact]
    public async Task LeCreateurChoisitUnThemeDeLOffre_LesMorceauxDeLaMancheSontDuTheme_AucunMorceauDeuxFois()
    {
        var (gamer, id, code) = await LaunchPendingAsync();
        var theme = (await gamer.PlayAsync(id, code, 1, AllFound)).Session.ThemeChoice!.Themes[0];

        var chosen = await ReadAsync(await ChooseThemeAsync(gamer, id, 2, theme.Id));

        Assert.Equal(theme.Name, Assert.Single(chosen.Session.Themes!).Name);
        Assert.Null(chosen.Session.ThemeChoice);
        Assert.Equal(2, chosen.Session.DifficultyChoice!.Round);
        var themed = await _game.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{code}' AND t.round = 2 AND EXISTS (SELECT 1 FROM catalogue.track_themes x WHERE x.track_id = t.track_id AND x.theme_id = {theme.Id})");
        Assert.Equal(5, themed);
        var reserveThemed = await _game.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM runs.challenge_reserve_tracks r JOIN runs.challenges c ON c.id = r.challenge_id WHERE c.code = '{code}' AND r.round = 2 AND EXISTS (SELECT 1 FROM catalogue.track_themes x WHERE x.track_id = r.track_id AND x.theme_id = {theme.Id})");
        Assert.Equal(2, reserveThemed);
        var distinct = await _game.Api.ScalarAsync<long>(
            $"SELECT count(DISTINCT track_id) FROM (SELECT track_id FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{code}' UNION ALL SELECT track_id FROM runs.challenge_reserve_tracks r JOIN runs.challenges c ON c.id = r.challenge_id WHERE c.code = '{code}') x");
        Assert.Equal(28, distinct);
        // Le thème est figé : visible sur le lien, et le nom ne bouge plus quand l'admin renomme.
        await _game.Api.ExecuteAsync($"UPDATE catalogue.themes SET name = 'Renommé' WHERE id = {theme.Id}");
        Assert.Equal(theme.Name, Assert.Single((await gamer.ChallengeAsync(code)).Themes!).Name);
    }

    [Fact]
    public async Task LeThemeMystere_EstUnAutreThemeQueLesDeuxProposes()
    {
        var (gamer, id, code) = await LaunchPendingAsync();
        var offered = (await gamer.PlayAsync(id, code, 1, AllFound)).Session.ThemeChoice!.Themes.Select(t => t.Id).ToList();

        var chosen = await ReadAsync(await ChooseThemeAsync(gamer, id, 2, null));

        var theme = Assert.Single(chosen.Session.Themes!);
        var names = new Dictionary<int, string> { [1] = "Années 80", [2] = "Films", [3] = "Rock" };
        Assert.DoesNotContain(offered, o => names[o] == theme.Name);
        Assert.Contains(theme.Name, names.Values);
    }

    [Fact]
    public async Task LOffreEstStable_RechargerLEcranRedonneLesMemesThemes()
    {
        var (gamer, id, code) = await LaunchPendingAsync();
        var first = (await gamer.PlayAsync(id, code, 1, AllFound)).Session.ThemeChoice!;

        var again = (await gamer.SessionAsync(id)).ThemeChoice!;

        Assert.Equal(first.Themes.Select(t => t.Id), again.Themes.Select(t => t.Id));
    }

    [Fact]
    public async Task UnThemeQuiNEstPasPropose_400_UnChoixHorsDeLaManche_OuDejaFait_409()
    {
        var (gamer, id, code) = await LaunchPendingAsync();
        var offered = (await gamer.PlayAsync(id, code, 1, AllFound)).Session.ThemeChoice!.Themes.Select(t => t.Id).ToList();
        var other = new[] { 1, 2, 3 }.Except(offered).First();

        Assert.Equal(HttpStatusCode.BadRequest, (await ChooseThemeAsync(gamer, id, 2, other)).StatusCode);
        var wrongRound = await ChooseThemeAsync(gamer, id, 3, offered[0]);
        Assert.Equal(HttpStatusCode.Conflict, wrongRound.StatusCode);
        Assert.Equal("runs.theme_locked", (await wrongRound.Content.ReadFromJsonAsync<ErrorBody>(Ct))!.Code);

        Assert.Equal(HttpStatusCode.OK, (await ChooseThemeAsync(gamer, id, 2, offered[0])).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await ChooseThemeAsync(gamer, id, 2, offered[1])).StatusCode);
    }

    [Fact]
    public async Task AvantLArrivee_LaMancheNAttendPasDeTheme_409()
    {
        var (gamer, id, _) = await LaunchPendingAsync();

        Assert.Equal(HttpStatusCode.Conflict, (await ChooseThemeAsync(gamer, id, 2, 1)).StatusCode);
    }

    [Fact]
    public async Task UnAmiQuiArriveLePremierALaManche_RecoitLeThemeMystere_EtLeCreateurLeTrouveDejaFige()
    {
        var (creator, creatorId, code) = await LaunchPendingAsync();
        var friend = await _game.NewInvitedAsync("Bob");
        var join = (await friend.JoinAsync(code)).Session;

        var atRound2 = await friend.PlayAsync(join.SessionId, code, 1, AllFound);

        var theme = Assert.Single(atRound2.Session.Themes!);
        Assert.Null(atRound2.Session.ThemeChoice);
        Assert.Equal(2, atRound2.Session.DifficultyChoice!.Round);
        var mine = await creator.PlayAsync(creatorId, code, 1, AllFound);
        Assert.Null(mine.Session.ThemeChoice);
        Assert.Equal(theme, Assert.Single(mine.Session.Themes!));
        Assert.Equal(HttpStatusCode.Conflict, (await ChooseThemeAsync(creator, creatorId, 2, 1)).StatusCode);
    }

    [Fact]
    public async Task LeCreateurSeVoitProposerDesThemesAvecLeurIcone_QuandIlsEnOnt()
    {
        await _game.Api.ExecuteAsync("UPDATE catalogue.themes SET icon = 'disc-3'");
        var (gamer, id, code) = await LaunchPendingAsync();

        var choice = (await gamer.PlayAsync(id, code, 1, AllFound)).Session.ThemeChoice!;

        Assert.All(choice.Themes, t => Assert.Equal("disc-3", t.Icon));
    }

    private sealed record ErrorBody(string Code);
}
