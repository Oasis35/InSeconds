using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Wolverine;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Outils des tests Daily : l'API (vrai <c>ITrackUsage</c>, vrai sélecteur, faux Deezer inutilisé), une horloge simulée et un
/// pool de morceaux écrit directement en base (aucun appel Deezer : on teste le tirage, pas l'ajout).
/// </summary>
public sealed class DailyApi : IAsyncDisposable
{
    public static readonly DateTimeOffset Start = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);

    public static readonly DateOnly Today = new(2026, 10, 5);

    private DailyApi(ApiFactory api, FakeTimeProvider time)
    {
        Api = api;
        Time = time;
    }

    public ApiFactory Api { get; }

    public FakeTimeProvider Time { get; }

    public static DailyApi Create(
        string connectionString, IReadOnlyDictionary<string, string>? settings = null, Action<IServiceCollection>? configureServices = null)
    {
        var time = new FakeTimeProvider(Start);
        var api = new ApiFactory(connectionString, services =>
        {
            services.AddSingleton<TimeProvider>(time);
            configureServices?.Invoke(services);
        }, settings);
        return new DailyApi(api, time);
    }

    public HttpClient Admin() => Api.CreateClient(TestUser.Admin);

    /// <summary>
    /// Ajoute <paramref name="count"/> morceaux jouables (extrait disponible), d'identifiants <paramref name="firstId"/> et
    /// suivants. Les identifiants sont connus : un test désigne ses morceaux sans les chercher.
    /// </summary>
    public Task AddPlayableTracksAsync(int count, int firstId = 1) => AddTracksAsync(count, firstId, previewStatus: 1);

    public Task AddTracksAsync(int count, int firstId, short previewStatus, bool disabled = false) =>
        Api.ExecuteAsync($"""
            INSERT INTO catalogue.tracks (id, deezer_track_id, artist, title, preview_status, disabled_at, created_at)
            SELECT n, 1000 + n, 'Artiste ' || n, 'Titre ' || n, {previewStatus}, {(disabled ? "now()" : "NULL")}, now()
            FROM generate_series({firstId}, {firstId + count - 1}) AS n
            """);

    /// <summary>Un défi déjà généré ce jour-là, avec ces morceaux dans cet ordre.</summary>
    public async Task AddChallengeAsync(DateOnly day, params int[] trackIds)
    {
        var id = await Api.ScalarAsync<long>("SELECT nextval('daily.challenges_hilo')");
        await Api.ExecuteAsync(
            $"INSERT INTO daily.challenges (id, date, seed, origin) VALUES ({id}, '{day:yyyy-MM-dd}', {day.DayNumber}, 1)");
        for (var i = 0; i < trackIds.Length; i++)
            await Api.ExecuteAsync($"INSERT INTO daily.challenge_tracks (challenge_id, position, track_id) VALUES ({id}, {i + 1}, {trackIds[i]})");
    }

    public async Task<GenerateChallengeResult> GenerateAsync(DateOnly? day = null, ChallengeOrigin origin = ChallengeOrigin.Nightly)
    {
        using var scope = Api.Services.CreateScope();
        var bus = scope.ServiceProvider.GetRequiredService<IMessageBus>();
        return await bus.InvokeAsync<GenerateChallengeResult>(new GenerateDailyChallenge(day ?? Today, origin), Ct);
    }

    /// <summary>Les morceaux du défi de ce jour, dans l'ordre des positions ; vide s'il n'y a pas de défi.</summary>
    public async Task<IReadOnlyList<int>> TracksOfAsync(DateOnly day)
    {
        var ids = await Api.ScalarAsync<int[]>(
            $"""
            SELECT array_agg(t.track_id ORDER BY t.position) FROM daily.challenge_tracks t
            JOIN daily.challenges c ON c.id = t.challenge_id WHERE c.date = '{day:yyyy-MM-dd}'
            """);
        return ids ?? [];
    }

    public Task<long> ChallengeCountAsync() => Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenges");

    public Task<short?> OriginOfAsync(DateOnly day) =>
        Api.ScalarAsync<short?>($"SELECT origin FROM daily.challenges WHERE date = '{day:yyyy-MM-dd}'");

    public ValueTask DisposeAsync() => Api.DisposeAsync();

    internal static CancellationToken Ct => TestContext.Current.CancellationToken;
}
