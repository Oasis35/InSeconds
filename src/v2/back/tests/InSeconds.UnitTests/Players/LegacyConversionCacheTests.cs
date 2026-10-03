using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.UnitTests.Players;

public class LegacyConversionCacheTests : IDisposable
{
    private static readonly Guid PlayerId = Guid.Parse("0a1b2c3d-0000-4000-8000-000000000001");

    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 3, 12, 0, 0, TimeSpan.Zero));
    private readonly LegacyConversionCache _cache;
    private int _opened;

    public LegacyConversionCacheTests() => _cache = new LegacyConversionCache(_time);

    public void Dispose() => _cache.Dispose();

    [Fact]
    public async Task MemeJeton_DansLaMinute_MemeSession()
    {
        var token = Guid.NewGuid();

        var first = await _cache.GetOrOpenAsync(token, OpenAsync, Ct);
        _time.Advance(TimeSpan.FromSeconds(59));
        var second = await _cache.GetOrOpenAsync(token, OpenAsync, Ct);

        Assert.Equal(first, second);
        Assert.Equal(1, _opened);
    }

    [Fact]
    public async Task MemeJeton_ApresLaMinute_NouvelleSession()
    {
        var token = Guid.NewGuid();

        var first = await _cache.GetOrOpenAsync(token, OpenAsync, Ct);
        _time.Advance(TimeSpan.FromMinutes(1));
        var second = await _cache.GetOrOpenAsync(token, OpenAsync, Ct);

        Assert.NotEqual(first!.DeviceSessionId, second!.DeviceSessionId);
        Assert.Equal(2, _opened);
    }

    [Fact]
    public async Task JetonsDifferents_SessionsDifferentes()
    {
        await _cache.GetOrOpenAsync(Guid.NewGuid(), OpenAsync, Ct);
        await _cache.GetOrOpenAsync(Guid.NewGuid(), OpenAsync, Ct);

        Assert.Equal(2, _opened);
    }

    [Fact]
    public async Task RequetesSimultanees_UneSeuleOuverture()
    {
        var token = Guid.NewGuid();
        var release = new TaskCompletionSource();

        async Task<OpenedDeviceSession?> SlowOpenAsync()
        {
            await release.Task;
            return await OpenAsync();
        }

        var requests = Enumerable.Range(0, 3).Select(_ => _cache.GetOrOpenAsync(token, SlowOpenAsync, Ct)).ToArray();
        release.SetResult();
        var sessions = await Task.WhenAll(requests);

        Assert.Equal(1, _opened);
        Assert.All(sessions, s => Assert.Equal(sessions[0], s));
    }

    [Fact]
    public async Task JetonInconnu_PasRetenu()
    {
        var token = Guid.NewGuid();

        await _cache.GetOrOpenAsync(token, () => Task.FromResult<OpenedDeviceSession?>(null), Ct);
        var opened = await _cache.GetOrOpenAsync(token, OpenAsync, Ct);

        Assert.NotNull(opened);
        Assert.Equal(1, _opened);
    }

    [Fact]
    public async Task Erreur_PasRetenue()
    {
        // Piège 37 : une erreur de base remonte, et la requête suivante réessaie.
        var token = Guid.NewGuid();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _cache.GetOrOpenAsync(token, () => throw new InvalidOperationException("base indisponible"), Ct));
        var opened = await _cache.GetOrOpenAsync(token, OpenAsync, Ct);

        Assert.NotNull(opened);
    }

    private Task<OpenedDeviceSession?> OpenAsync() =>
        Task.FromResult<OpenedDeviceSession?>(new OpenedDeviceSession(PlayerId, Interlocked.Increment(ref _opened), IsAdmin: false));

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
