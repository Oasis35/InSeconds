using System.Net.Http.Json;
using System.Text.RegularExpressions;
using InSeconds.Api.Modules.Daily.Contracts;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Testing.Email;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Outils des tests de connexion : l'API avec ses emails capturés et le gel offert enregistré, et des
/// navigateurs (cookies gardés, <c>Origin</c> du front).
/// </summary>
internal sealed partial class MagicLinkApi : IAsyncDisposable
{
    private MagicLinkApi(ApiFactory api)
    {
        Api = api;
        Emails = api.Services.GetRequiredService<CapturingEmailSender>();
    }

    public ApiFactory Api { get; }

    public CapturingEmailSender Emails { get; }

    public RecordingStreakGrants Grants { get; private init; } = new();

    /// <param name="recordGrants">Vrai (par défaut) : le gel offert à la création d'un compte est seulement enregistré (<see cref="RecordingStreakGrants"/>) ; faux : le vrai (Daily, E2).</param>
    public static MagicLinkApi Create(string connectionString, IReadOnlyDictionary<string, string>? settings = null, bool recordGrants = true)
    {
        var grants = new RecordingStreakGrants();
        var api = new ApiFactory(connectionString, services =>
        {
            services.AddCapturingEmailSender();
            if (recordGrants)
            {
                services.RemoveAll<IStreakGrants>();
                services.AddSingleton<IStreakGrants>(grants);
            }
        }, settings);
        return new MagicLinkApi(api) { Grants = grants };
    }

    /// <summary>Un navigateur sur le front : garde ses cookies, envoie l'<c>Origin</c> du front.</summary>
    public HttpClient Browser()
    {
        var client = Api.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", ApiFactory.FrontOrigin);
        return client;
    }

    /// <summary>Demande un lien pour cette adresse et renvoie le jeton reçu par email.</summary>
    public async Task<string> RequestTokenAsync(string email, HttpClient? browser = null)
    {
        var before = Emails.Sent.Count;
        var response = await (browser ?? Browser()).PostAsJsonAsync("/api/players/auth/magic-link", new RequestMagicLink(email), Ct);
        response.EnsureSuccessStatusCode();
        var token = TokenOf(await WaitForEmailAsync(email, before));
        await WaitForTokenAsync(token);
        return token;
    }

    /// <summary>
    /// Attend que le jeton reçu par email soit enregistré : le handler envoie l'email juste avant de valider
    /// sa transaction. Un humain met des secondes à cliquer ; un test, non.
    /// </summary>
    public async Task WaitForTokenAsync(string token)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            if (await Api.ScalarAsync<long>($"SELECT count(*) FROM players.auth_tokens WHERE token_hash = sha256(convert_to('{token}', 'UTF8'))") == 1)
                return;
            await Task.Delay(50, Ct);
        }

        throw new TimeoutException("Jeton reçu par email jamais enregistré.");
    }

    /// <summary>Le prochain email envoyé à cette adresse, après les <paramref name="alreadySent"/> premiers.</summary>
    public async Task<CapturedEmail> WaitForEmailAsync(string email, int alreadySent)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            if (Emails.Sent.Skip(alreadySent).LastOrDefault(e => string.Equals(e.To, email, StringComparison.OrdinalIgnoreCase)) is { } sent)
                return sent;
            await Task.Delay(50, Ct);
        }

        throw new TimeoutException($"Aucun email envoyé à {email}.");
    }

    public static string TokenOf(CapturedEmail email) => TokenInLink().Match(email.HtmlBody).Groups[1].Value;

    public static Task<HttpResponseMessage> VerifyAsync(HttpClient browser, string token, string? pseudo = null) =>
        browser.PostAsJsonAsync("/api/players/auth/magic-link/verify", new VerifyMagicLink(token, pseudo), Ct);

    /// <summary>Se connecte avec une adresse (et le pseudo, si le compte est à créer).</summary>
    public async Task SignInAsync(HttpClient browser, string email, string? pseudo = null)
    {
        var token = await RequestTokenAsync(email);
        var response = await VerifyAsync(browser, token, pseudo);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>(Ct);
        if (body!.NeedsPseudo)
            throw new InvalidOperationException("Pseudo attendu pour créer le compte.");
    }

    /// <summary>
    /// Un appareil connecté à cette adresse, dont le cookie est rejoué tel quel à chaque requête (il
    /// reste présenté après une révocation, comme le ferait un cookie copié).
    /// </summary>
    public async Task<Device> SignInDeviceAsync(string email, string? pseudo = null, string? userAgent = null)
    {
        var token = await RequestTokenAsync(email);
        var client = Api.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", ApiFactory.FrontOrigin);
        if (userAgent is not null)
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", userAgent);

        var response = await VerifyAsync(client, token, pseudo);
        response.EnsureSuccessStatusCode();
        var cookie = CookieHeaders.Pair(response, "inseconds");
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return new Device(client, cookie, (await MeAsync(client))!.PlayerId);
    }

    public static async Task<PlayerMeResponse?> MeAsync(HttpClient browser)
    {
        var response = await browser.GetAsync("/api/players/me", Ct);
        return response.StatusCode == System.Net.HttpStatusCode.NoContent
            ? null
            : await response.Content.ReadFromJsonAsync<PlayerMeResponse>(Ct);
    }

    public ValueTask DisposeAsync() => Api.DisposeAsync();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [GeneratedRegex("/account/login/verify\\?token=([A-Za-z0-9_-]+)")]
    private static partial Regex TokenInLink();
}

/// <summary>Remplace le gel offert de Daily : garde les joueurs à qui il a été accordé.</summary>
internal sealed class RecordingStreakGrants : IStreakGrants
{
    private readonly List<Guid> _granted = [];

    public IReadOnlyList<Guid> Granted
    {
        get
        {
            lock (_granted)
                return [.. _granted];
        }
    }

    /// <summary>
    /// Appelé à chaque gel accordé, au milieu de la création du compte (transaction ouverte, compte pas
    /// encore enregistré) : pour provoquer une concurrence à ce moment précis.
    /// </summary>
    public Func<Guid, Task>? OnGrant { get; set; }

    public Task GrantAccountCreationFreezeAsync(Guid playerId, CancellationToken ct)
    {
        lock (_granted)
            _granted.Add(playerId);
        return OnGrant?.Invoke(playerId) ?? Task.CompletedTask;
    }
}

/// <summary>Un appareil connecté : son client (cookie rejoué tel quel), ce cookie et son joueur.</summary>
internal sealed record Device(HttpClient Client, string Cookie, Guid PlayerId);

internal static class BrowserExtensions
{
    /// <summary>Un autre navigateur qui rejoue tel quel un cookie (« nom=valeur »).</summary>
    public static HttpClient WithCookie(this ApiFactory api, string cookie)
    {
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        client.DefaultRequestHeaders.Add("Origin", ApiFactory.FrontOrigin);
        return client;
    }
}
