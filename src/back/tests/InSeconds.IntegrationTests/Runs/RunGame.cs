using System.Net.Http.Json;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Testing.Deezer;
using InSeconds.IntegrationTests.Daily;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Une partie de run jouée par HTTP, comme le front : un pool de 20 morceaux classés (le 1 est le plus connu, la manche k tire donc dans les morceaux
/// (k-1)×5+1 à k×5), des joueurs avec ou sans accès. Les morceaux s'appellent « Artiste N » et « Titre N » (N = identifiant), leur identifiant Deezer
/// est 1000 + N.
/// </summary>
internal sealed class RunGame : IAsyncDisposable
{
    private RunGame(GameApi game) => Game = game;

    public GameApi Game { get; }

    public ApiFactory Api => Game.Api;

    public static async Task<RunGame> CreateAsync(
        string connectionString, int tracks = 20, IReadOnlyDictionary<string, string>? settings = null, Action<IServiceCollection>? configureServices = null)
    {
        var game = new RunGame(await GameApi.CreateAsync(connectionString, tracks: 0, settings, configureServices));
        if (tracks > 0)
        {
            await game.Game.App.AddPlayableTracksAsync(tracks);
            await game.Api.ExecuteAsync($"UPDATE catalogue.tracks SET deezer_rank = 1000000 - id * 1000 WHERE id <= {tracks}");
        }

        return game;
    }

    /// <summary>Un compte que l'admin a autorisé à lancer des runs.</summary>
    public async Task<RunGamer> NewInvitedAsync(string pseudo)
    {
        var gamer = await Game.NewPlayerAsync(pseudo);
        await Api.ExecuteAsync($"INSERT INTO runs.access (player_id, granted_at) VALUES ('{gamer.Id}', now())");
        return new RunGamer(this, gamer.Id, gamer.Client);
    }

    /// <summary>Un joueur sans accès : un invité, ou un compte (avec un pseudo) que l'admin n'a pas autorisé.</summary>
    public async Task<RunGamer> NewPlayerAsync(string? pseudo = null)
    {
        var gamer = await Game.NewPlayerAsync(pseudo);
        return new RunGamer(this, gamer.Id, gamer.Client);
    }

    /// <summary>Le morceau du catalogue à cette position de la playlist.</summary>
    public Task<int> TrackAtAsync(string code, int position) =>
        Api.ScalarAsync<int>(
            $"SELECT t.track_id FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{code}' AND t.position = {position}");

    /// <summary>Deezer n'a plus d'extrait pour ce morceau (réponse déterminée : il sera neutralisé).</summary>
    public Task RemovePreviewAsync(int trackId) =>
        Api.ExecuteAsync($"UPDATE catalogue.tracks SET deezer_track_id = {FakeDeezerHandler.NoPreviewFrom + trackId} WHERE id = {trackId}");

    /// <summary>Deezer ne répond plus pour ce morceau (quota, erreur 4 en HTTP 200 : il reste en cours).</summary>
    public Task MakePreviewUnavailableAsync(int trackId) =>
        Api.ExecuteAsync($"UPDATE catalogue.tracks SET deezer_track_id = {FakeDeezerHandler.QuotaFrom + trackId} WHERE id = {trackId}");

    public Task RestorePreviewAsync(int trackId) =>
        Api.ExecuteAsync($"UPDATE catalogue.tracks SET deezer_track_id = {1000 + trackId} WHERE id = {trackId}");

    public ValueTask DisposeAsync() => Game.DisposeAsync();
}

/// <summary>Un joueur et son navigateur.</summary>
internal sealed class RunGamer(RunGame game, Guid id, HttpClient client)
{
    public Guid Id { get; } = id;

    public HttpClient Client { get; } = client;

    public Task<HttpResponseMessage> LaunchRawAsync() => Client.PostAsync("/api/runs/challenges", null, Ct);

    public async Task<RunPlayResponse> LaunchAsync() => await ReadAsync<RunPlayResponse>(await LaunchRawAsync());

    public Task<HttpResponseMessage> JoinRawAsync(string code) => Client.PostAsync($"/api/runs/challenges/{code}/sessions", null, Ct);

    public async Task<RunPlayResponse> JoinAsync(string code) => await ReadAsync<RunPlayResponse>(await JoinRawAsync(code));

    public Task<HttpResponseMessage> AnswerRawAsync(int sessionId, int position, string? artist, string? title) =>
        Client.PostAsJsonAsync($"/api/runs/sessions/{sessionId}/answers", new SubmitRunAnswer(position, artist, title), Ct);

    /// <summary>Répond au morceau de cette position : artiste et titre justes ou non.</summary>
    public async Task<RunPlayResponse> AnswerAsync(int sessionId, string code, int position, bool artist = true, bool title = true)
    {
        var trackId = await game.TrackAtAsync(code, position);
        return await ReadAsync<RunPlayResponse>(
            await AnswerRawAsync(sessionId, position, artist ? $"Artiste {trackId}" : "Personne", title ? $"Titre {trackId}" : "Rien"));
    }

    /// <summary>Répond à une suite de morceaux à partir de cette position (vrai : trouvé, faux : raté) ; rend la dernière réponse.</summary>
    public async Task<RunPlayResponse> PlayAsync(int sessionId, string code, int fromPosition, params bool[] found)
    {
        RunPlayResponse? last = null;
        for (var i = 0; i < found.Length; i++)
            last = await AnswerAsync(sessionId, code, fromPosition + i, found[i], found[i]);
        return last!;
    }

    public Task<HttpResponseMessage> ListenRawAsync(int sessionId, int position, decimal seconds) =>
        Client.PatchAsJsonAsync($"/api/runs/sessions/{sessionId}/listening", new UpdateRunListening(position, seconds), Ct);

    public Task<HttpResponseMessage> PreviewRawAsync(int sessionId) => Client.PostAsync($"/api/runs/sessions/{sessionId}/preview", null, Ct);

    public async Task<RunPlayResponse> PreviewAsync(int sessionId) => await ReadAsync<RunPlayResponse>(await PreviewRawAsync(sessionId));

    public Task<HttpResponseMessage> AbandonRawAsync(int sessionId) => Client.PostAsync($"/api/runs/sessions/{sessionId}/abandon", null, Ct);

    public Task<HttpResponseMessage> SessionRawAsync(int sessionId) => Client.GetAsync($"/api/runs/sessions/{sessionId}", Ct);

    public async Task<RunSessionResponse> SessionAsync(int sessionId) => await ReadAsync<RunSessionResponse>(await SessionRawAsync(sessionId));

    public async Task<RunChallengeResponse> ChallengeAsync(string code) =>
        await ReadAsync<RunChallengeResponse>(await Client.GetAsync($"/api/runs/challenges/{code}", Ct));

    public Task<HttpResponseMessage> ComparisonRawAsync(string code) => Client.GetAsync($"/api/runs/challenges/{code}/comparison", Ct);

    public async Task<RunComparisonResponse> ComparisonAsync(string code) => await ReadAsync<RunComparisonResponse>(await ComparisonRawAsync(code));

    public async Task<RunsMeResponse> MeAsync() => await ReadAsync<RunsMeResponse>(await Client.GetAsync("/api/runs/me", Ct));

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode} : {await response.Content.ReadAsStringAsync(Ct)}");
        return (await response.Content.ReadFromJsonAsync<T>(Ct))!;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
