using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Runs.Application;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Les manches à thème de la Série : le premier joueur qui arrive à une manche (à partir de la deuxième) en choisit le thème, juste avant son premier
/// son, parmi deux thèmes ou le thème mystère ; les morceaux de la manche sont alors tirés dans ce thème, figés pour tous les joueurs de la playlist.
/// Moins de trois thèmes assez fournis : aucun choix, la manche est tirée sans thème.
/// </summary>
public class RunThemeApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly bool[] AllFound = [true, true, true, true, true];

    private RunGame _game = null!;
    private RunGamer _gamer = null!;

    /// <summary>
    /// 120 morceaux, trois thèmes de 40 morceaux (« Années 80 » 1 à 40, « Films » 41 à 80, « Rock » 81 à 120) et « Jazz », qui n'en a qu'un : trop peu
    /// pour une manche (5 morceaux). Quoi que les autres manches aient pris, chaque thème en garde assez.
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

    private Task<HttpResponseMessage> ChooseThemeAsync(RunGamer gamer, int sessionId, int round, int? themeId) =>
        gamer.Client.PostAsJsonAsync($"/api/runs/sessions/{sessionId}/theme", new ChooseRunTheme(round, themeId), Ct);

    private static async Task<RunPlayResponse> ReadAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RunPlayResponse>(Ct))!;
    }

    private async Task<(RunGamer Gamer, int Id, string Code, RunPlayResponse AtRound2)> AtRoundTwoAsync(RunGamer? gamer = null)
    {
        gamer ??= _gamer;
        var start = (await gamer.LaunchAsync()).Session;
        var atRound2 = await gamer.PlayAsync(start.SessionId, start.ChallengeCode, 1, AllFound);
        return (gamer, start.SessionId, start.ChallengeCode, atRound2);
    }

    [Fact]
    public async Task AvecTroisThemesFournis_LaDeuxiemeMancheAttendSonTheme_RienNePartAvantLeChoix()
    {
        var (_, _, code, atRound2) = await AtRoundTwoAsync();

        var choice = atRound2.Session.ThemeChoice!;
        Assert.Equal(2, choice.Round);
        Assert.Equal(2, choice.Themes.Count);
        // Rien de la manche ne part avant le choix : ni extrait, ni thème sur le lien.
        Assert.Null(atRound2.Current);
        Assert.Null((await _gamer.ChallengeAsync(code)).Themes);
    }

    [Fact]
    public async Task LaPremiereManche_NEstJamaisATheme()
    {
        var start = (await _gamer.LaunchAsync()).Session;

        Assert.Null(start.ThemeChoice);
        Assert.Null(start.Themes);
    }

    [Fact]
    public async Task SousTroisThemesAssezFournis_AucunChoix_LaMancheSeTireSansTheme()
    {
        // « Films » perd ses morceaux : il ne reste que deux thèmes assez fournis.
        await _game.Api.ExecuteAsync("DELETE FROM catalogue.track_themes WHERE theme_id = 2");

        var (_, _, _, atRound2) = await AtRoundTwoAsync();

        Assert.Null(atRound2.Session.ThemeChoice);
        Assert.NotNull(atRound2.Current);
        Assert.Null(atRound2.Session.Themes);
    }

    [Fact]
    public async Task LeJoueurChoisitUnThemeDeLOffre_LesMorceauxDeLaMancheSontDuTheme_AucunMorceauDeuxFois()
    {
        var (gamer, id, code, atRound2) = await AtRoundTwoAsync();
        var theme = atRound2.Session.ThemeChoice!.Themes[0];

        var chosen = await ReadAsync(await ChooseThemeAsync(gamer, id, 2, theme.Id));

        Assert.Equal(theme.Name, Assert.Single(chosen.Session.Themes!).Name);
        Assert.Null(chosen.Session.ThemeChoice);
        Assert.NotNull(chosen.Current);
        var themed = await _game.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{code}' AND t.round = 2 AND EXISTS (SELECT 1 FROM catalogue.track_themes x WHERE x.track_id = t.track_id AND x.theme_id = {theme.Id})");
        Assert.Equal(5, themed);
        var distinct = await _game.Api.ScalarAsync<long>(
            $"SELECT count(DISTINCT track_id) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{code}'");
        Assert.Equal(10, distinct);
        // Le thème est figé : visible sur le lien, et le nom ne bouge plus quand l'admin renomme.
        await _game.Api.ExecuteAsync($"UPDATE catalogue.themes SET name = 'Renommé' WHERE id = {theme.Id}");
        Assert.Equal(theme.Name, Assert.Single((await gamer.ChallengeAsync(code)).Themes!).Name);
    }

    [Fact]
    public async Task LeThemeMystere_EstUnAutreThemeQueLesDeuxProposes()
    {
        var (gamer, id, _, atRound2) = await AtRoundTwoAsync();
        var offered = atRound2.Session.ThemeChoice!.Themes.Select(t => t.Id).ToList();

        var chosen = await ReadAsync(await ChooseThemeAsync(gamer, id, 2, null));

        var theme = Assert.Single(chosen.Session.Themes!);
        var names = new Dictionary<int, string> { [1] = "Années 80", [2] = "Films", [3] = "Rock" };
        Assert.DoesNotContain(offered, o => names[o] == theme.Name);
        Assert.Contains(theme.Name, names.Values);
    }

    [Fact]
    public async Task LOffreEstStable_RechargerLEcranRedonneLesMemesThemes()
    {
        var (gamer, id, _, atRound2) = await AtRoundTwoAsync();

        var again = (await gamer.SessionAsync(id)).ThemeChoice!;

        Assert.Equal(atRound2.Session.ThemeChoice!.Themes.Select(t => t.Id), again.Themes.Select(t => t.Id));
    }

    [Fact]
    public async Task UnThemeQuiNEstPasPropose_400_UnChoixHorsDeLaManche_OuDejaFait_409()
    {
        var (gamer, id, _, atRound2) = await AtRoundTwoAsync();
        var offered = atRound2.Session.ThemeChoice!.Themes.Select(t => t.Id).ToList();
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
        var start = (await _gamer.LaunchAsync()).Session;

        Assert.Equal(HttpStatusCode.Conflict, (await ChooseThemeAsync(_gamer, start.SessionId, 2, 1)).StatusCode);
    }

    [Fact]
    public async Task UnAmiQuiArriveApres_TrouveLeThemeDejaFige_EtNeChoisitRien()
    {
        var (creator, _, code, atRound2) = await AtRoundTwoAsync();
        var theme = atRound2.Session.ThemeChoice!.Themes[0];
        await ReadAsync(await ChooseThemeAsync(creator, atRound2.Session.SessionId, 2, theme.Id));
        var friend = await _game.NewInvitedAsync("Bob");
        var join = (await friend.JoinAsync(code)).Session;

        var mine = await friend.PlayAsync(join.SessionId, code, 1, AllFound);

        Assert.Null(mine.Session.ThemeChoice);
        Assert.Equal(theme.Name, Assert.Single(mine.Session.Themes!).Name);
        Assert.NotNull(mine.Current);
        Assert.Equal(HttpStatusCode.Conflict, (await ChooseThemeAsync(friend, join.SessionId, 2, theme.Id)).StatusCode);
    }

    [Fact]
    public async Task LeJoueurVoitLesThemesAvecLeurIcone_QuandIlsEnOnt()
    {
        await _game.Api.ExecuteAsync("UPDATE catalogue.themes SET icon = 'disc-3'");

        var (_, _, _, atRound2) = await AtRoundTwoAsync();

        Assert.All(atRound2.Session.ThemeChoice!.Themes, t => Assert.Equal("disc-3", t.Icon));
    }

    private sealed record ErrorBody(string Code);
}
