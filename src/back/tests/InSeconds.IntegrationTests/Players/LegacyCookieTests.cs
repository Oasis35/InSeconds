using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Reprise des cookies v1 (§ 5.5 du plan v2, R1, R10, S6). Le cookie v1 est fabriqué comme en v1 :
/// Data Protection avec le nom d'application <c>InSeconds</c> et le purpose <c>InSeconds.Auth.Cookie</c>,
/// sur le même trousseau de clés (copié à l'import). Le hash de <c>legacy_tokens</c> est calculé en SQL,
/// comme à l'import (§ 8.2). L'horloge est simulée pour franchir la minute de réutilisation d'une
/// conversion (<c>LegacyConversionCache</c>).
/// </summary>
public class LegacyCookieTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 3, 12, 0, 0, TimeSpan.Zero));
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() =>
        _api = new ApiFactory(await postgres.CreateDatabaseAsync(), services => services.AddSingleton<TimeProvider>(_time));

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task CookieV1_DevientUnCookieV2_SurUneNouvelleSession()
    {
        var (playerId, v1Cookie) = await CreateV1PlayerAsync();

        var response = await GetMeWithCookieAsync(v1Cookie);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(playerId, (await response.Content.ReadFromJsonAsync<PlayerMeResponse>(Ct))!.PlayerId);
        Assert.True(CookieHeaders.Deletes(response, "authToken"));
        Assert.NotNull(CookieHeaders.Find(response, "inseconds"));
        Assert.Equal(1L, await _api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{playerId}'"));

        // Le nouveau cookie suffit ensuite, sans l'ancien.
        var next = await GetMeWithCookieAsync(CookieHeaders.Pair(response, "inseconds"));
        Assert.Equal(playerId, (await next.Content.ReadFromJsonAsync<PlayerMeResponse>(Ct))!.PlayerId);
    }

    [Fact]
    public async Task MemeCookieV1_SurDeuxNavigateurs_DeuxAppareilsDuMemeJoueur()
    {
        // En v1, tous les appareils d'un compte partagent le même jeton (R1) : aucun n'est déconnecté.
        var (playerId, v1Cookie) = await CreateV1PlayerAsync();

        var first = await GetMeWithCookieAsync(v1Cookie);
        // Au-delà de la minute de réutilisation : le second navigateur obtient sa propre session.
        _time.Advance(TimeSpan.FromMinutes(1));
        var second = await GetMeWithCookieAsync(v1Cookie);

        Assert.Equal(2L, await _api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{playerId}'"));
        foreach (var converted in new[] { first, second })
        {
            var me = await GetMeWithCookieAsync(CookieHeaders.Pair(converted, "inseconds"));
            Assert.Equal(playerId, (await me.Content.ReadFromJsonAsync<PlayerMeResponse>(Ct))!.PlayerId);
        }
    }

    [Fact]
    public async Task RequetesSimultaneesAvecLeMemeCookieV1_UneSeuleSession()
    {
        // Au premier chargement, le front envoie plusieurs requêtes en parallèle avec le cookie v1.
        var (playerId, v1Cookie) = await CreateV1PlayerAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => GetMeWithCookieAsync(v1Cookie)));

        Assert.Equal(1L, await _api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{playerId}'"));
        var sessionIds = responses
            .Select(r => CookieHeaders.Ticket(_api.Services, r, "inseconds").FindFirstValue(PlayerClaims.DeviceSessionId))
            .Distinct();
        Assert.Single(sessionIds);
    }

    [Fact]
    public async Task CookieV1Rejoue_DansLaMinute_PasDeNouvelleSession()
    {
        // Un cookie v1 copié et rejoué en boucle (le navigateur l'efface, un script non) ne remplit pas la table.
        var (playerId, v1Cookie) = await CreateV1PlayerAsync();

        for (var i = 0; i < 5; i++)
        {
            await GetMeWithCookieAsync(v1Cookie);
            _time.Advance(TimeSpan.FromSeconds(10));
        }

        Assert.Equal(1L, await _api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{playerId}'"));
    }

    [Fact]
    public async Task DeconnecterLesAutres_CookieV1PasEncoreConverti_Refuse()
    {
        // Un appareil (ou un cookie copié) qui n'est pas revenu depuis la bascule est un « autre appareil » :
        // son cookie v1 ne doit plus ouvrir de session une fois les autres appareils déconnectés (S6).
        var (playerId, v1Cookie) = await CreateV1PlayerAsync();
        var converted = await GetMeWithCookieAsync(v1Cookie);
        var v2Cookie = CookieHeaders.Pair(converted, "inseconds");

        var revoke = await SendWithCookieAsync(HttpMethod.Post, "/api/players/me/devices/revoke-others", v2Cookie);

        Assert.Equal(HttpStatusCode.OK, revoke.StatusCode);
        Assert.Equal(0L, await _api.ScalarAsync<long>($"SELECT count(*) FROM players.legacy_tokens WHERE player_id = '{playerId}'"));
        // Au-delà de la minute de réutilisation de la conversion : le cookie v1 ne mène plus à rien.
        _time.Advance(TimeSpan.FromMinutes(1));
        var replayed = await GetMeWithCookieAsync(v1Cookie);
        Assert.Equal(HttpStatusCode.NoContent, replayed.StatusCode);
        Assert.True(CookieHeaders.Deletes(replayed, "authToken"));
        Assert.Equal(1L, await _api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{playerId}'"));
        // L'appareil qui a demandé la déconnexion des autres reste connecté.
        Assert.Equal(playerId, (await (await GetMeWithCookieAsync(v2Cookie)).Content.ReadFromJsonAsync<PlayerMeResponse>(Ct))!.PlayerId);
    }

    [Fact]
    public async Task CompteAdminV1_AdminDesLaPremiereRequete()
    {
        var (playerId, v1Cookie) = await CreateV1PlayerAsync();
        await _api.ExecuteAsync(
            $"INSERT INTO players.accounts (player_id, email, pseudo, is_admin) VALUES ('{playerId}', 'admin@example.com', 'Admin', true)");

        var response = await SendWithCookieAsync("/api/admin/me", v1Cookie);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Le rôle n'est pas écrit dans le nouveau cookie : il est relu en base à chaque requête.
        var ticket = CookieHeaders.Ticket(_api.Services, response, "inseconds");
        Assert.Equal(playerId.ToString(), ticket.FindFirstValue(PlayerClaims.PlayerId));
        Assert.DoesNotContain(ticket.Claims, c => c.Type == ClaimTypes.Role);
        var next = await SendWithCookieAsync("/api/admin/me", CookieHeaders.Pair(response, "inseconds"));
        Assert.Equal(HttpStatusCode.OK, next.StatusCode);
    }

    [Fact]
    public async Task JetonInconnu_AncienCookieSupprime_Anonyme()
    {
        Start();
        var v1Cookie = $"authToken={V1Protector().Protect(Guid.NewGuid().ToString())}";

        var response = await GetMeWithCookieAsync(v1Cookie);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(CookieHeaders.Deletes(response, "authToken"));
        Assert.Equal(0L, await _api.ScalarAsync<long>("SELECT count(*) FROM players.device_sessions"));
    }

    [Fact]
    public async Task JoueurSupprime_PasDeReprise()
    {
        var (playerId, v1Cookie) = await CreateV1PlayerAsync();
        await _api.ExecuteAsync($"UPDATE players.players SET deleted_at = now() WHERE id = '{playerId}'");

        var response = await GetMeWithCookieAsync(v1Cookie);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(0L, await _api.ScalarAsync<long>("SELECT count(*) FROM players.device_sessions"));
    }

    [Fact]
    public async Task CookieIllisible_Supprime()
    {
        Start();

        var response = await GetMeWithCookieAsync("authToken=pas-un-cookie-v1");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(CookieHeaders.Deletes(response, "authToken"));
    }

    [Fact]
    public async Task DejaUnCookieV2_LAncienEstSupprimeSansConversion()
    {
        var (v1PlayerId, v1Cookie) = await CreateV1PlayerAsync();
        var guest = await _api.CreateClient().PostAsync("/api/players/guest", null, Ct);
        var guestId = (await guest.Content.ReadFromJsonAsync<GuestResponse>(Ct))!.PlayerId;

        var response = await GetMeWithCookieAsync($"{CookieHeaders.Pair(guest, "inseconds")}; {v1Cookie}");

        Assert.Equal(guestId, (await response.Content.ReadFromJsonAsync<PlayerMeResponse>(Ct))!.PlayerId);
        Assert.True(CookieHeaders.Deletes(response, "authToken"));
        Assert.Equal(0L, await _api.ScalarAsync<long>($"SELECT count(*) FROM players.device_sessions WHERE player_id = '{v1PlayerId}'"));
    }

    [Fact]
    public async Task ErreurDeBase_500_GardeLAncienCookie()
    {
        // Piège 37 : sans base, l'ancien cookie reste en place pour la requête suivante.
        var (_, v1Cookie) = await CreateV1PlayerAsync();
        await using var api = new ApiFactory(_api.ConnectionString,
            services => services.AddScoped<IPlayerSessions, UnavailablePlayerSessions>());
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Cookie", v1Cookie);

        var response = await client.GetAsync("/api/players/me", Ct);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Empty(CookieHeaders.All(response));
    }

    [Fact]
    public async Task Hash_IdentiqueAuCalculDeLImport()
    {
        var token = Guid.NewGuid();

        var sql = await _api.ScalarAsync<byte[]>($"SELECT sha256(convert_to('{token}'::uuid::text, 'UTF8'))");

        Assert.Equal(sql, LegacyToken.HashOf(token));
    }

    /// <summary>Un joueur v1 tel qu'après l'import : sa ligne, son jeton haché, et le cookie v1 de son navigateur.</summary>
    private async Task<(Guid PlayerId, string V1Cookie)> CreateV1PlayerAsync()
    {
        Start();
        var playerId = Guid.NewGuid();
        var authToken = Guid.NewGuid();
        await _api.ExecuteAsync($"""
            INSERT INTO players.players (id, created_at) VALUES ('{playerId}', now());
            INSERT INTO players.legacy_tokens (player_id, token_hash)
            VALUES ('{playerId}', sha256(convert_to('{authToken}'::uuid::text, 'UTF8')));
            """);
        return (playerId, $"authToken={V1Protector().Protect(authToken.ToString())}");
    }

    /// <summary>Démarre l'API : migrations, puis une première clé Data Protection en base.</summary>
    private void Start()
    {
        _ = _api.Server;
        _api.Services.GetDataProtector("démarrage").Protect("x");
    }

    /// <summary>Data Protection configuré comme la v1 (Program.cs v1), sur le trousseau de clés de la base.</summary>
    private IDataProtector V1Protector()
    {
        var services = new ServiceCollection();
        services.AddDbContext<InSecondsDbContext>(options => DatabaseServiceCollectionExtensions.Configure(options, _api.ConnectionString));
        services.AddDataProtection().SetApplicationName("InSeconds").PersistKeysToDbContext<InSecondsDbContext>();
        return services.BuildServiceProvider().GetDataProtector("InSeconds.Auth.Cookie");
    }

    private Task<HttpResponseMessage> GetMeWithCookieAsync(string cookie) => SendWithCookieAsync("/api/players/me", cookie);

    private Task<HttpResponseMessage> SendWithCookieAsync(string path, string cookie) => SendWithCookieAsync(HttpMethod.Get, path, cookie);

    private async Task<HttpResponseMessage> SendWithCookieAsync(HttpMethod method, string path, string cookie)
    {
        var client = _api.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Add("Cookie", cookie);
        return await client.SendAsync(request, Ct);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
