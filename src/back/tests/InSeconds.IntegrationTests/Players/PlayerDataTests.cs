using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Droits RGPD du joueur depuis son profil : la copie de ses données (<c>GET /api/players/me/export</c>) et la suppression de son compte
/// (<c>POST /api/players/me/delete</c>, pseudo retapé).
/// </summary>
public class PlayerDataTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string SafariIphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        // Le vrai gel offert à la création du compte : la série fait partie des données exportées et effacées.
        _app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), recordGrants: false);
        _ = _app.Api.Server;
        await PlayerDataSeed.AddChallengeAsync(_app.Api);
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task Export_ToutesSesDonnees_EnPieceJointe()
    {
        var device = await _app.SignInDeviceAsync("alice@example.com", "Alice", SafariIphone);
        await PlayerDataSeed.AddGameAsync(_app.Api, device.PlayerId);

        var response = await device.Client.GetAsync("/api/players/me/export", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Matches(@"^""?inseconds-donnees-\d{4}-\d{2}-\d{2}\.json""?$", response.Content.Headers.ContentDisposition?.FileName);
        Assert.True(response.Headers.CacheControl?.NoStore);

        var export = (await response.Content.ReadFromJsonAsync<PlayerDataExport>(Ct))!;
        Assert.Equal(device.PlayerId, export.PlayerId);
        Assert.Equal(new AccountExport("alice@example.com", "Alice", export.Account!.LinkedAt, IsAdmin: false), export.Account);
        Assert.NotNull(export.Account.LinkedAt);
        Assert.Equal("Safari · iPhone", Assert.Single(export.Devices).Label);
        Assert.Equal(1, export.Streak!.Freezes);

        var game = Assert.Single(export.Games);
        Assert.Equal(PlayerDataSeed.Day, game.Date);
        Assert.Equal("Completed", game.Status);
        Assert.Equal(1850, game.TotalScore);
        Assert.Collection(game.Tracks,
            first =>
            {
                Assert.Equal((1, "Artiste 1", "Titre 1"), (first.Position, first.Artist, first.Title));
                Assert.Equal((0.5m, true, true, 1000), (first.ListenedSeconds, first.ArtistFound, first.TitleFound, first.Score));
            },
            second =>
            {
                Assert.Equal((2, "Artiste 2", "Titre 2"), (second.Position, second.Artist, second.Title));
                Assert.Equal((1m, true, false, 850, 1), (second.ListenedSeconds, second.ArtistFound, second.TitleFound, second.Score, second.HintLevel));
            });
    }

    [Fact]
    public async Task Export_NeDonneQueSesDonnees()
    {
        var alice = await _app.SignInDeviceAsync("seule@example.com", "Seule");
        var bob = await _app.SignInDeviceAsync("bob@example.com", "Bob");
        await PlayerDataSeed.AddGameAsync(_app.Api, bob.PlayerId);

        var export = (await alice.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        Assert.Equal("seule@example.com", export.Account!.Email);
        Assert.Empty(export.Games);
        Assert.Single(export.Devices);
    }

    [Fact]
    public async Task Export_Invite_SansCompte()
    {
        var browser = _app.Browser();
        (await browser.PostAsync("/api/players/guest", null, Ct)).EnsureSuccessStatusCode();

        var export = (await browser.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        Assert.Null(export.Account);
        Assert.Single(export.Devices);
        Assert.Null(export.Streak);
        Assert.Empty(export.Games);
    }

    [Fact]
    public async Task Export_SansCookie_401() =>
        Assert.Equal(HttpStatusCode.Unauthorized, (await _app.Browser().GetAsync("/api/players/me/export", Ct)).StatusCode);

    [Fact]
    public async Task Suppression_EffaceTout_EtDeconnecteTousSesAppareils()
    {
        var phone = await _app.SignInDeviceAsync("efface@example.com", "Efface");
        var laptop = await _app.SignInDeviceAsync("efface@example.com");
        var bob = await _app.SignInDeviceAsync("reste@example.com", "Reste");
        await PlayerDataSeed.AddGameAsync(_app.Api, phone.PlayerId);
        await PlayerDataSeed.AddGameAsync(_app.Api, bob.PlayerId);
        await _app.Api.ExecuteAsync(
            $"INSERT INTO players.legacy_tokens (player_id, token_hash) VALUES ('{phone.PlayerId}', '\\x0102')");
        // Un lien de connexion demandé pour son adresse, pas encore utilisé : il ne porte que l'adresse.
        await _app.RequestTokenAsync("efface@example.com");

        // Pseudo retapé avec une autre casse et des espaces : accepté, comme son unicité.
        var response = await phone.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount(" efface "), Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(CookieHeaders.Deletes(response, "inseconds"));
        // Toutes les tables qui ont une colonne player_id, lues dans le schéma : une table ajoutée plus tard sans être effacée fait échouer ce test.
        var tables = await _app.Api.ScalarAsync<string[]>("""
            SELECT array_agg(table_schema || '.' || table_name) FROM information_schema.columns
            WHERE column_name = 'player_id' AND table_schema NOT IN ('pg_catalog', 'information_schema')
            """);
        Assert.Contains("daily.sessions", tables!);
        foreach (var table in tables!)
            Assert.Equal(0L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM {table} WHERE player_id = '{phone.PlayerId}'"));
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM players.players WHERE id = '{phone.PlayerId}'"));
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE email = 'efface@example.com'"));
        Assert.Equal(2L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM daily.answers"));

        // Ses deux appareils sont refusés tout de suite (pas au bout de la minute du cache) ; l'autre joueur n'a rien perdu.
        Assert.Null(await MagicLinkApi.MeAsync(phone.Client));
        Assert.Null(await MagicLinkApi.MeAsync(laptop.Client));
        Assert.Equal("Reste", (await MagicLinkApi.MeAsync(bob.Client))!.Pseudo);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.sessions WHERE player_id = '{bob.PlayerId}'"));
    }

    [Fact]
    public async Task Suppression_LAdresseEtLePseudoSontLibresEnsuite()
    {
        var device = await _app.SignInDeviceAsync("revient@example.com", "Revient");
        (await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Revient"), Ct)).EnsureSuccessStatusCode();

        var again = await _app.SignInDeviceAsync("revient@example.com", "Revient");

        Assert.NotEqual(device.PlayerId, again.PlayerId);
    }

    [Fact]
    public async Task Suppression_PseudoFaux_400_RienNEstEfface()
    {
        var device = await _app.SignInDeviceAsync("garde@example.com", "Garde");

        var response = await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Gardé"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(PlayersErrorCodes.PseudoMismatch, await CodeOfAsync(response));
        Assert.Equal("Garde", (await MagicLinkApi.MeAsync(device.Client))!.Pseudo);
    }

    [Fact]
    public async Task Suppression_Invite_403()
    {
        var browser = _app.Browser();
        (await browser.PostAsync("/api/players/guest", null, Ct)).EnsureSuccessStatusCode();

        var response = await browser.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("x"), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(PlayersErrorCodes.GuestForbidden, await CodeOfAsync(response));
    }

    [Fact]
    public async Task Suppression_SansCookie_401() =>
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await _app.Browser().PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("x"), Ct)).StatusCode);

    private static async Task<string?> CodeOfAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct))!.Extensions["code"]?.ToString();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

/// <summary>Un défi passé de deux morceaux (« Artiste 1 » / « Titre 1 », « Artiste 2 » / « Titre 2 »), et une partie terminée dessus.</summary>
internal static class PlayerDataSeed
{
    public static readonly DateOnly Day = new(2026, 10, 1);

    public const int ChallengeId = 900_001;

    public static Task AddChallengeAsync(ApiFactory api) =>
        api.ExecuteAsync($"""
            INSERT INTO catalogue.tracks (id, deezer_track_id, artist, title, preview_status, created_at)
            SELECT n, 1000 + n, 'Artiste ' || n, 'Titre ' || n, 1, now() FROM generate_series(1, 2) AS n;
            INSERT INTO daily.challenges (id, date, seed, origin) VALUES ({ChallengeId}, '{Day:yyyy-MM-dd}', 1, 1);
            INSERT INTO daily.challenge_tracks (challenge_id, position, track_id) VALUES ({ChallengeId}, 1, 1), ({ChallengeId}, 2, 2);
            """);

    /// <summary>Partie terminée : 0,5 s tout juste (1000), puis 1 s, artiste seulement, un indice (850).</summary>
    public static async Task AddGameAsync(ApiFactory api, Guid playerId)
    {
        var id = await api.ScalarAsync<int>("SELECT 900000 + count(*)::int FROM daily.sessions");
        await api.ExecuteAsync($"""
            INSERT INTO daily.sessions (id, player_id, challenge_id, status, started_at, ended_at, total_score, total_listened_seconds)
            VALUES ({id}, '{playerId}', {ChallengeId}, 1, '2026-10-01T08:00:00Z', '2026-10-01T08:05:00Z', 1850, 1.5);
            INSERT INTO daily.answers (session_id, position, listened_seconds, was_extended, hint_level, artist_correct, title_correct, score) VALUES
              ({id}, 1, 0.5, false, 0, true, true, 1000),
              ({id}, 2, 1, true, 1, true, false, 850);
            """);
    }
}
