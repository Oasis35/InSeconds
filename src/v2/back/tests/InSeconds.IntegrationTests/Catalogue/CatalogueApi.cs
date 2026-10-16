using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Testing.Deezer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// L'usage des morceaux d'un test : Daily n'existe pas encore (E), un test lui fait dire ce que le jeu en a fait
/// (déjà utilisé, dans le défi du jour, en cooldown).
/// </summary>
internal sealed class TestTrackUsage : ITrackUsage
{
    private readonly Dictionary<int, TrackUsage> _usages = [];

    public HashSet<int> Cooldown { get; } = [];

    public List<DateOnly> AskedDays { get; } = [];

    public void Set(int trackId, TrackUsage usage) => _usages[trackId] = usage;

    public Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<int, TrackUsage>>(
            trackIds.Where(_usages.ContainsKey).ToDictionary(id => id, id => _usages[id]));

    public Task<IReadOnlySet<int>> GetTracksInCooldownAsync(DateOnly day, CancellationToken ct)
    {
        AskedDays.Add(day);
        return Task.FromResult<IReadOnlySet<int>>(Cooldown);
    }
}

/// <summary>Outils des tests Catalogue : l'API avec le faux Deezer, un usage des morceaux simulé et une horloge simulée.</summary>
internal sealed class CatalogueApi : IAsyncDisposable
{
    public static readonly DateTimeOffset Start = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);

    private CatalogueApi(ApiFactory api, TestTrackUsage usage, FakeTimeProvider time)
    {
        Api = api;
        Usage = usage;
        Time = time;
    }

    public ApiFactory Api { get; }

    public TestTrackUsage Usage { get; }

    public FakeTimeProvider Time { get; }

    public FakeDeezerState Deezer => Api.FakeDeezer;

    public static CatalogueApi Create(string connectionString, IReadOnlyDictionary<string, string>? settings = null)
    {
        var usage = new TestTrackUsage();
        var time = new FakeTimeProvider(Start);
        var merged = new Dictionary<string, string>
        {
            // Pas de pause entre les lots : les tests n'attendent pas (le comportement des lots est testé en unitaire).
            ["Catalogue:Refresh:BatchDelay"] = "00:00:00",
        };
        foreach (var (key, value) in settings ?? new Dictionary<string, string>())
            merged[key] = value;

        var api = new ApiFactory(connectionString, services =>
        {
            services.AddSingleton<TimeProvider>(time);
            services.RemoveAll<ITrackUsage>();
            services.AddSingleton<ITrackUsage>(usage);
        }, merged);
        return new CatalogueApi(api, usage, time);
    }

    public HttpClient Admin() => Api.CreateClient(TestUser.Admin);

    public async Task<TrackSummary> AddAsync(long deezerTrackId)
    {
        var response = await Admin().PostAsJsonAsync("/api/admin/catalogue/tracks", new AddTrack(deezerTrackId), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TrackSummary>(Ct))!;
    }

    public async Task<IReadOnlyList<TrackListItem>> ListAsync() =>
        (await Admin().GetFromJsonAsync<List<TrackListItem>>("/api/admin/catalogue/tracks", Ct))!;

    /// <summary>L'état stocké de l'extrait : 0 inconnu, 1 disponible, 2 absent.</summary>
    public Task<short> PreviewStatusOfAsync(int trackId) =>
        Api.ScalarAsync<short>($"SELECT preview_status FROM catalogue.tracks WHERE id = {trackId}");

    public ValueTask DisposeAsync() => Api.DisposeAsync();

    internal static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct);
        Assert.Equal(code, problem!.Extensions["code"]?.ToString());
    }

    internal static CancellationToken Ct => TestContext.Current.CancellationToken;
}
