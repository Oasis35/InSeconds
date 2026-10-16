using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Modules.Daily.Application;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Une partie du défi du jour (E2) : l'API avec une horloge simulée, un pool de morceaux jouables, et des joueurs qui jouent par HTTP, comme le front.
/// Les morceaux ont pour nom « Artiste N » et « Titre N » (N = identifiant du morceau) : <see cref="Gamer.AnswerCorrectlyAsync"/> sait les retrouver.
/// </summary>
internal sealed class GameApi : IAsyncDisposable
{
    private GameApi(DailyApi app) => App = app;

    public DailyApi App { get; }

    public ApiFactory Api => App.Api;

    public FakeTimeProvider Time => App.Time;

    public static async Task<GameApi> CreateAsync(
        string connectionString,
        int tracks = 40,
        IReadOnlyDictionary<string, string>? settings = null,
        Action<IServiceCollection>? configureServices = null)
    {
        var game = new GameApi(DailyApi.Create(connectionString, settings, configureServices));
        _ = game.Api.Server;
        if (tracks > 0)
            await game.App.AddPlayableTracksAsync(tracks);
        return game;
    }

    /// <summary>Un joueur qui existe en base. Avec un pseudo : il a un compte (les gels de série ne sont pour lui que s'il en a un).</summary>
    public async Task<Gamer> NewPlayerAsync(string? pseudo = null)
    {
        var id = Guid.NewGuid();
        await Api.ExecuteAsync($"INSERT INTO players.players (id, created_at) VALUES ('{id}', now())");
        if (pseudo is not null)
            await Api.ExecuteAsync($"INSERT INTO players.accounts (player_id, email, pseudo) VALUES ('{id}', '{pseudo.ToLowerInvariant()}@example.com', '{pseudo}')");
        return new Gamer(this, id, Api.CreateClient(new TestUser(id, IsAdmin: false)));
    }

    /// <summary>Le défi de ce jour, déjà généré (origine nocturne).</summary>
    public Task GenerateAsync(DateOnly? day = null) => App.GenerateAsync(day);

    /// <summary>L'identifiant du morceau à cette position du défi de ce jour.</summary>
    public async Task<int> TrackAtAsync(DateOnly day, int position) =>
        (await App.TracksOfAsync(day))[position - 1];

    /// <summary>L'identifiant du défi de ce jour.</summary>
    public async Task<int> ChallengeIdAsync(DateOnly day) =>
        await Api.ScalarAsync<int>($"SELECT id FROM daily.challenges WHERE date = '{day:yyyy-MM-dd}'");

    /// <summary>
    /// Une partie posée directement en base sur le défi de ce jour (les statistiques d'un jour passé n'ont pas besoin de la jouer) : ses réponses aux
    /// positions 1, 2… et son score. <paramref name="status"/> : 0 en cours, 1 terminée, 2 abandonnée, 3 expirée.
    /// </summary>
    public async Task<int> AddSessionAsync(
        Guid playerId, DateOnly day, short status, params (decimal Seconds, bool Artist, bool Title, bool Extended, int Score)[] answers)
    {
        var id = await Api.ScalarAsync<int>("SELECT nextval('daily.sessions_hilo')::int");
        var challenge = await ChallengeIdAsync(day);
        var total = answers.Sum(x => x.Score);
        var seconds = answers.Sum(x => x.Seconds);
        await Api.ExecuteAsync(
            $"""
            INSERT INTO daily.sessions (id, player_id, challenge_id, status, started_at, total_score, total_listened_seconds)
            VALUES ({id}, '{playerId}', {challenge}, {status}, now(), {total}, {seconds.ToString(System.Globalization.CultureInfo.InvariantCulture)})
            """);
        for (var i = 0; i < answers.Length; i++)
        {
            var x = answers[i];
            await Api.ExecuteAsync(
                $"""
                INSERT INTO daily.answers (session_id, position, listened_seconds, was_extended, hint_level, artist_correct, title_correct, score)
                VALUES ({id}, {i + 1}, {x.Seconds.ToString(System.Globalization.CultureInfo.InvariantCulture)}, {x.Extended}, 0, {x.Artist}, {x.Title}, {x.Score})
                """);
        }

        return id;
    }

    /// <summary>Le joueur est supprimé (suppression logique) : il disparaît de toutes les statistiques.</summary>
    public Task DeletePlayerAsync(Guid playerId) => Api.ExecuteAsync($"UPDATE players.players SET deleted_at = now() WHERE id = '{playerId}'");

    public Task SetStreakAsync(Guid playerId, int streak, DateOnly? lastPlayed, int freezes) =>
        Api.ExecuteAsync(
            $"""
            INSERT INTO daily.streaks (player_id, current_streak, last_played_date, freezes)
            VALUES ('{playerId}', {streak}, {(lastPlayed is { } d ? $"'{d:yyyy-MM-dd}'" : "NULL")}, {freezes})
            ON CONFLICT (player_id) DO UPDATE SET current_streak = {streak}, last_played_date = {(lastPlayed is { } e ? $"'{e:yyyy-MM-dd}'" : "NULL")}, freezes = {freezes}
            """);

    public async Task SetSettingAsync(string key, string json)
    {
        await Api.ExecuteAsync(
            $"INSERT INTO infra.settings (key, value, description, updated_at) VALUES ('{key}', '{json}', '', now()) ON CONFLICT (key) DO UPDATE SET value = '{json}'");
        Api.Services.GetRequiredService<ISettingsReloader>().Reload();
    }

    public ValueTask DisposeAsync() => App.DisposeAsync();
}

/// <summary>Un joueur et son navigateur.</summary>
internal sealed class Gamer(GameApi game, Guid id, HttpClient client)
{
    public Guid Id { get; } = id;

    public HttpClient Client { get; } = client;

    public Task<HttpResponseMessage> StartRawAsync() => Client.PostAsync("/api/daily/sessions", null, Ct);

    public async Task<StartSessionResponse> StartAsync()
    {
        var response = await StartRawAsync();
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<StartSessionResponse>(Ct))!;
    }

    public Task<HttpResponseMessage> ListenAsync(int sessionId, int position, decimal seconds) =>
        Client.PatchAsJsonAsync($"/api/daily/sessions/{sessionId}/listening", new UpdateListening(position, seconds), Ct);

    public Task<HttpResponseMessage> HintAsync(int sessionId, int position, int level) =>
        Client.PostAsJsonAsync($"/api/daily/sessions/{sessionId}/hints", new RequestHint(position, level), Ct);

    public Task<HttpResponseMessage> AnswerAsync(
        int sessionId, int position, decimal seconds, string? artist, string? title, bool wasExtended = false) =>
        Client.PostAsJsonAsync($"/api/daily/sessions/{sessionId}/answers", new SubmitAnswer(position, seconds, wasExtended, artist, title), Ct);

    public Task<HttpResponseMessage> AbandonAsync(int sessionId) => Client.PostAsync($"/api/daily/sessions/{sessionId}/abandon", null, Ct);

    public async Task<TodayResponse> TodayAsync() =>
        (await Client.GetFromJsonAsync<TodayResponse>("/api/daily/today", Ct))!;

    /// <summary>Répond juste (artiste et titre) au morceau de cette position du défi de ce jour.</summary>
    public async Task<SubmitAnswerResponse> AnswerCorrectlyAsync(int sessionId, int position, decimal seconds, DateOnly? day = null)
    {
        var trackId = await game.TrackAtAsync(day ?? DailyApi.Today, position);
        var response = await AnswerAsync(sessionId, position, seconds, $"Artiste {trackId}", $"Titre {trackId}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SubmitAnswerResponse>(Ct))!;
    }

    /// <summary>Termine la partie : répond juste à tous les morceaux restants, à ce palier.</summary>
    public async Task<SubmitAnswerResponse> FinishAsync(int sessionId, int fromPosition = 1, int count = 5, decimal seconds = 1, DateOnly? day = null)
    {
        SubmitAnswerResponse? last = null;
        for (var position = fromPosition; position <= count; position++)
            last = await AnswerCorrectlyAsync(sessionId, position, seconds, day);
        return last!;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
