using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Connexion par lien magique (§ 5.5 et 5.6 du plan v2) : demande, jeton généré par le handler de
/// l'outbox (S1), vérification filtrée par usage (S2), origine (piège 22), confirmation explicite
/// (piège 21), pas de conversion d'un compte lié (piège 30), nouvelle session à chaque connexion (S5).
/// </summary>
public class MagicLinkTests(PostgresFixture postgres) : IAsyncLifetime
{
    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server; // démarre l'hôte : migrations, tables de Wolverine
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task Demande_204_EmailAvecLienVersLeFront_SeulLeHashEnBase()
    {
        var response = await _app.Browser().PostAsJsonAsync("/api/players/auth/magic-link", new RequestMagicLink("  Joueuse@Example.com "), Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var email = await _app.WaitForEmailAsync("joueuse@example.com", 0);
        Assert.Equal("Ton lien de connexion IN//SECONDS", email.Subject);
        var token = MagicLinkApi.TokenOf(email);
        await _app.WaitForTokenAsync(token);
        Assert.Contains($"http://localhost:5176/account/login/verify?token={token}", email.HtmlBody, StringComparison.Ordinal);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"""
            SELECT count(*) FROM players.auth_tokens
            WHERE purpose = 1 AND email = 'joueuse@example.com' AND consumed_at IS NULL
              AND token_hash = sha256(convert_to('{token}', 'UTF8'))
              AND expires_at = created_at + interval '15 minutes'
            """));
    }

    [Fact]
    public async Task S1_LeJetonNApparaitDansAucuneTableDeMessaging()
    {
        var token = await _app.RequestTokenAsync("s1@example.com");

        // Le message est bien en base (son adresse s'y trouve), mais pas le jeton.
        Assert.True(await CountInSchemaAsync("messaging", "s1@example.com") > 0);
        Assert.Equal(0L, await CountInSchemaAsync("messaging", token));
    }

    [Fact]
    public async Task DeuxDemandesDansLaMinute_UnSeulLien()
    {
        await _app.RequestTokenAsync("presse@example.com");

        var again = await _app.Browser().PostAsJsonAsync("/api/players/auth/magic-link", new RequestMagicLink("presse@example.com"), Ct);
        // Une autre adresse, demandée ensuite, prouve que la file a avancé.
        await _app.RequestTokenAsync("temoin@example.com");
        await Task.Delay(500, Ct);

        Assert.Equal(HttpStatusCode.NoContent, again.StatusCode);
        Assert.Single(_app.Emails.Sent, e => e.To == "presse@example.com");
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE email = 'presse@example.com'"));
    }

    [Fact]
    public async Task Demande_AdresseInvalide_400()
    {
        var response = await _app.Browser().PostAsJsonAsync("/api/players/auth/magic-link", new RequestMagicLink("pas-une-adresse"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task S5_InviteConverti_MemeJoueur_GelOffert_AncienneSessionRevoquee()
    {
        var browser = _app.Browser();
        var guest = await browser.PostAsync("/api/players/guest", null, Ct);
        var guestId = (await guest.Content.ReadFromJsonAsync<GuestResponse>(Ct))!.PlayerId;
        var guestCookie = CookieHeaders.Pair(guest, "inseconds");
        var token = await _app.RequestTokenAsync("nouvelle@example.com");

        // Première étape : pas de compte pour cette adresse, le pseudo est demandé, le jeton reste valable.
        var step1 = await MagicLinkApi.VerifyAsync(browser, token);
        Assert.True((await step1.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>(Ct))!.NeedsPseudo);
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE consumed_at IS NOT NULL"));

        var step2 = await MagicLinkApi.VerifyAsync(browser, token, "Nouvelle");

        Assert.Equal(HttpStatusCode.OK, step2.StatusCode);
        Assert.False((await step2.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>(Ct))!.NeedsPseudo);
        var me = await MagicLinkApi.MeAsync(browser);
        Assert.Equal(new PlayerMeResponse(guestId, IsGuest: false, "nouvelle@example.com", "Nouvelle", IsAdmin: false), me);
        Assert.Equal([guestId], _app.Grants.Granted);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE consumed_at IS NOT NULL"));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM players.accounts WHERE player_id = '{guestId}' AND linked_at IS NOT NULL"));
        // S5 : nouvelle session pour le compte, l'ancienne (celle de l'invité) est révoquée et refusée.
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{guestId}' AND revoked_at IS NULL"));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{guestId}' AND revoked_at IS NOT NULL"));
        Assert.Null(await MagicLinkApi.MeAsync(_app.Api.WithCookie(guestCookie)));
    }

    [Fact]
    public async Task SansCookie_AdresseInconnue_NouveauJoueurAvecSonCompte()
    {
        var browser = _app.Browser();

        await _app.SignInAsync(browser, "sans-cookie@example.com", "SansCookie");

        var me = await MagicLinkApi.MeAsync(browser);
        Assert.NotNull(me);
        Assert.Equal("SansCookie", me.Pseudo);
        Assert.Equal([me.PlayerId], _app.Grants.Granted);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
    }

    [Fact]
    public async Task CompteExistant_ConnexionSurCeCompte_SansGel_SessionInviteRevoquee()
    {
        var accountId = await InsertAccountAsync("admin@example.com", "Admin", isAdmin: true);
        var browser = _app.Browser();
        var guest = await browser.PostAsync("/api/players/guest", null, Ct);
        var guestCookie = CookieHeaders.Pair(guest, "inseconds");
        var token = await _app.RequestTokenAsync("ADMIN@example.com");

        var response = await MagicLinkApi.VerifyAsync(browser, token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False((await response.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>(Ct))!.NeedsPseudo);
        Assert.Equal(accountId, (await MagicLinkApi.MeAsync(browser))!.PlayerId);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/admin/me", Ct)).StatusCode);
        Assert.Empty(_app.Grants.Granted);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.accounts"));
        Assert.Null(await MagicLinkApi.MeAsync(_app.Api.WithCookie(guestCookie)));
    }

    [Fact]
    public async Task ChaqueConnexion_UneNouvelleSession()
    {
        var accountId = await InsertAccountAsync("habitue@example.com", "Habitue");
        var first = _app.Browser();
        var second = _app.Browser();

        await _app.SignInAsync(first, "habitue@example.com");
        await _app.SignInAsync(second, "habitue@example.com");

        Assert.Equal(2L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{accountId}' AND revoked_at IS NULL"));
        Assert.Equal(accountId, (await MagicLinkApi.MeAsync(first))!.PlayerId);
        Assert.Equal(accountId, (await MagicLinkApi.MeAsync(second))!.PlayerId);
    }

    [Fact]
    public async Task JetonDejaUtilise_400()
    {
        await InsertAccountAsync("unique@example.com", "Unique");
        var token = await _app.RequestTokenAsync("unique@example.com");
        Assert.Equal(HttpStatusCode.OK, (await MagicLinkApi.VerifyAsync(_app.Browser(), token)).StatusCode);

        var again = await MagicLinkApi.VerifyAsync(_app.Browser(), token);

        await AssertProblemAsync(again, HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);
    }

    [Fact]
    public async Task JetonExpire_400()
    {
        await InsertAccountAsync("tard@example.com", "Tard");
        var token = await InsertTokenAsync(AuthTokenPurpose.Login, "email, created_at, expires_at", "'tard@example.com', now() - interval '20 minutes', now() - interval '5 minutes'");

        await AssertProblemAsync(await MagicLinkApi.VerifyAsync(_app.Browser(), token), HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);
    }

    [Fact]
    public async Task JetonInconnu_400()
    {
        _ = await _app.Browser().PostAsync("/api/players/guest", null, Ct);

        await AssertProblemAsync(await MagicLinkApi.VerifyAsync(_app.Browser(), AuthTokenSecret.Generate()), HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);
    }

    [Fact]
    public async Task S2_UnJetonDeChangementDEmail_NeConnectePas()
    {
        var playerId = await InsertAccountAsync("change@example.com", "Change");
        var token = await InsertTokenAsync(AuthTokenPurpose.EmailChange, "player_id, new_email, created_at, expires_at", $"'{playerId}', 'autre@example.com', now(), now() + interval '15 minutes'");

        var response = await MagicLinkApi.VerifyAsync(_app.Browser(), token);

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE consumed_at IS NOT NULL"));
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.device_sessions"));
    }

    [Fact]
    public async Task PseudoDejaPris_SansTenirCompteDeLaCasse_409_JetonGarde()
    {
        await InsertAccountAsync("premier@example.com", "Pris");
        var browser = _app.Browser();
        var token = await _app.RequestTokenAsync("second@example.com");

        await AssertProblemAsync(await MagicLinkApi.VerifyAsync(browser, token, "PRIS"), HttpStatusCode.Conflict, PlayersErrorCodes.PseudoTaken);

        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE consumed_at IS NOT NULL"));
        Assert.Equal(HttpStatusCode.OK, (await MagicLinkApi.VerifyAsync(browser, token, "Libre")).StatusCode);
    }

    [Fact]
    public async Task UsageUnique_DeuxConfirmationsSimultanees_UneSeulePasse()
    {
        var token = await _app.RequestTokenAsync("double@example.com");
        var firstInside = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        // Seule la première confirmation s'arrête au milieu de la création du compte, jeton en main.
        _app.Grants.OnGrant = async _ =>
        {
            if (firstInside.TrySetResult())
                await release.Task;
        };

        var first = MagicLinkApi.VerifyAsync(_app.Browser(), token, "Double");
        Task<HttpResponseMessage> second;
        try
        {
            await firstInside.Task.WaitAsync(TimeSpan.FromSeconds(15), Ct);
            second = MagicLinkApi.VerifyAsync(_app.Browser(), token, "Double");
            // La seconde attend le verrou du jeton, que la première garde jusqu'à la fin de sa transaction.
            await WaitForLockWaitAsync();
        }
        finally
        {
            release.TrySetResult();
        }

        Assert.Equal(HttpStatusCode.OK, (await first).StatusCode);
        await AssertProblemAsync(await second, HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.accounts"));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.device_sessions"));
    }

    [Fact]
    public async Task PseudoPrisAuMemeMoment_409_JetonGarde_SansCookie()
    {
        var token = await _app.RequestTokenAsync("course@example.com");
        // Quelqu'un prend le pseudo entre la vérification préalable et l'enregistrement du compte.
        _app.Grants.OnGrant = async _ => await InsertAccountAsync("rivale@example.com", "Course");
        var browser = _app.Browser();

        var response = await MagicLinkApi.VerifyAsync(browser, token, "COURSE");

        await AssertProblemAsync(response, HttpStatusCode.Conflict, PlayersErrorCodes.PseudoTaken);
        Assert.Empty(CookieHeaders.All(response));
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE consumed_at IS NOT NULL"));
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.accounts WHERE email = 'course@example.com'"));

        _app.Grants.OnGrant = null;
        Assert.Equal(HttpStatusCode.OK, (await MagicLinkApi.VerifyAsync(browser, token, "Libre")).StatusCode);
    }

    [Fact]
    public async Task PseudoInvalide_400()
    {
        var token = await _app.RequestTokenAsync("pseudo@example.com");

        Assert.Equal(HttpStatusCode.BadRequest, (await MagicLinkApi.VerifyAsync(_app.Browser(), token, "<b>")).StatusCode);
    }

    [Fact]
    public async Task CompteDUnJoueurSupprime_400()
    {
        var playerId = await InsertAccountAsync("parti@example.com", "Parti");
        await _app.Api.ExecuteAsync($"UPDATE players.players SET deleted_at = now() WHERE id = '{playerId}'");
        var token = await _app.RequestTokenAsync("parti@example.com");

        await AssertProblemAsync(await MagicLinkApi.VerifyAsync(_app.Browser(), token), HttpStatusCode.BadRequest, PlayersErrorCodes.InvalidOrExpiredToken);
    }

    [Fact]
    public async Task Piege21_SeulLePostConsommeLeJeton()
    {
        await InsertAccountAsync("scanner@example.com", "Scanner");
        var token = await _app.RequestTokenAsync("scanner@example.com");

        // Un scanner d'email qui suit le lien ne fait que des GET : rien ne consomme le jeton.
        var get = await _app.Browser().GetAsync($"/api/players/auth/magic-link/verify?token={token}", Ct);
        Assert.Equal(HttpStatusCode.MethodNotAllowed, get.StatusCode);
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE consumed_at IS NOT NULL"));

        Assert.Equal(HttpStatusCode.OK, (await MagicLinkApi.VerifyAsync(_app.Browser(), token)).StatusCode);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("https://attaquant.example", null)]
    // Commence par l'origine du front, mais l'hôte est attaquant.example.
    [InlineData(null, "http://localhost:5176@attaquant.example/account/login/verify")]
    [InlineData(null, "https://attaquant.example/http://localhost:5176")]
    public async Task Piege22_OrigineInconnue_403_JetonGarde(string? origin, string? referer)
    {
        await InsertAccountAsync("csrf@example.com", "Csrf");
        var token = await _app.RequestTokenAsync("csrf@example.com");
        var client = _app.Api.CreateClient();
        if (origin is not null)
            client.DefaultRequestHeaders.Add("Origin", origin);
        if (referer is not null)
            client.DefaultRequestHeaders.Referrer = new Uri(referer);

        var response = await MagicLinkApi.VerifyAsync(client, token);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "common.forbidden");
        Assert.Empty(CookieHeaders.All(response));
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens WHERE consumed_at IS NOT NULL"));
    }

    [Fact]
    public async Task Piege22_RefererDuFront_SansOrigin_Accepte()
    {
        await InsertAccountAsync("referer@example.com", "Referer");
        var token = await _app.RequestTokenAsync("referer@example.com");
        var client = _app.Api.CreateClient();
        client.DefaultRequestHeaders.Referrer = new Uri("http://localhost:5176/account/login/verify?token=x");

        Assert.Equal(HttpStatusCode.OK, (await MagicLinkApi.VerifyAsync(client, token)).StatusCode);
    }

    [Fact]
    public async Task Piege30_NavigateurDejaConnecte_AdresseInconnue_NouveauCompte_LePremierIntact()
    {
        var browser = _app.Browser();
        await _app.SignInAsync(browser, "alice@example.com", "Alice");
        var alice = (await MagicLinkApi.MeAsync(browser))!;

        await _app.SignInAsync(browser, "bob@example.com", "Bob");

        var bob = (await MagicLinkApi.MeAsync(browser))!;
        Assert.NotEqual(alice.PlayerId, bob.PlayerId);
        Assert.Equal(("bob@example.com", "Bob"), (bob.Email, bob.Pseudo));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM players.accounts WHERE player_id = '{alice.PlayerId}' AND email = 'alice@example.com' AND pseudo = 'Alice'"));
        Assert.Equal([alice.PlayerId, bob.PlayerId], _app.Grants.Granted);
    }

    [Fact]
    public async Task Piege30_LienDUnTiersOuvertParUnJoueurConnecte_NeDonnePasAccesASonCompte()
    {
        var victim = _app.Browser();
        await _app.SignInAsync(victim, "victime@example.com", "Victime");
        var victimId = (await MagicLinkApi.MeAsync(victim))!.PlayerId;

        // Le tiers fait confirmer à la victime un lien demandé pour sa propre adresse...
        var lure = await _app.RequestTokenAsync("tiers@example.com");
        Assert.Equal(HttpStatusCode.OK, (await MagicLinkApi.VerifyAsync(victim, lure, "Leurre")).StatusCode);
        // ...puis se connecte avec son adresse : il obtient le compte créé pour elle, pas celui de la victime.
        var attacker = _app.Browser();
        await _app.SignInAsync(attacker, "tiers@example.com");

        var attackerMe = (await MagicLinkApi.MeAsync(attacker))!;
        Assert.NotEqual(victimId, attackerMe.PlayerId);
        Assert.Equal("tiers@example.com", attackerMe.Email);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM players.accounts WHERE player_id = '{victimId}' AND email = 'victime@example.com' AND pseudo = 'Victime'"));
    }

    [Fact]
    public async Task RateLimiting_Demande_5Par10Minutes_PuisEn429()
    {
        await using var limited = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });
        var client = limited.Browser();

        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.NoContent,
                (await client.PostAsJsonAsync("/api/players/auth/magic-link", new RequestMagicLink($"debit{i}@example.com"), Ct)).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests,
            (await client.PostAsJsonAsync("/api/players/auth/magic-link", new RequestMagicLink("debit5@example.com"), Ct)).StatusCode);
    }

    private async Task<Guid> InsertAccountAsync(string email, string pseudo, bool isAdmin = false)
    {
        var playerId = Guid.NewGuid();
        await _app.Api.ExecuteAsync($"""
            INSERT INTO players.players (id, created_at) VALUES ('{playerId}', now());
            INSERT INTO players.accounts (player_id, email, pseudo, is_admin) VALUES ('{playerId}', '{email}', '{pseudo}', {isAdmin});
            """);
        return playerId;
    }

    /// <summary>Attend qu'une requête de cette base soit bloquée sur un verrou.</summary>
    private async Task WaitForLockWaitAsync()
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (await _app.Api.ScalarAsync<long>(
                   "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'") == 0)
        {
            if (DateTime.UtcNow > deadline)
                throw new TimeoutException("Aucune requête n'attend de verrou.");
            await Task.Delay(50, Ct);
        }
    }

    /// <summary>Un jeton écrit directement en base ; renvoie sa valeur brute.</summary>
    private async Task<string> InsertTokenAsync(AuthTokenPurpose purpose, string columns, string values)
    {
        var token = AuthTokenSecret.Generate();
        await _app.Api.ExecuteAsync($"""
            INSERT INTO players.auth_tokens (purpose, token_hash, {columns})
            VALUES ({(short)purpose}, sha256(convert_to('{token}', 'UTF8')), {values});
            """);
        return token;
    }

    /// <summary>Nombre de valeurs, toutes colonnes de toutes les tables du schéma, qui contiennent ce texte.</summary>
    private async Task<long> CountInSchemaAsync(string schema, string text)
    {
        var columns = await ColumnsOfSchemaAsync(schema);
        Assert.NotEmpty(columns);
        var total = 0L;
        foreach (var (table, column, type) in columns)
        {
            var condition = type == "bytea"
                ? $"position(convert_to('{text}', 'UTF8') in \"{column}\") > 0"
                : $"position('{text}' in \"{column}\"::text) > 0";
            total += await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM {schema}.\"{table}\" WHERE {condition}");
        }

        return total;
    }

    private async Task<IReadOnlyList<(string Table, string Column, string Type)>> ColumnsOfSchemaAsync(string schema)
    {
        await using var connection = new Npgsql.NpgsqlConnection(_app.Api.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new Npgsql.NpgsqlCommand(
            "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = @schema", connection);
        command.Parameters.AddWithValue("schema", schema);
        var columns = new List<(string, string, string)>();
        await using var reader = await command.ExecuteReaderAsync(Ct);
        while (await reader.ReadAsync(Ct))
            columns.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        return columns;
    }

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct);
        Assert.Equal(code, problem!.Extensions["code"]?.ToString());
        Assert.True(problem.Extensions.ContainsKey("traceId"));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
