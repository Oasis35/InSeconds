using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.UnitTests.Catalogue;

/// <summary>
/// Le contrôle des extraits (commande <c>RefreshPreviews</c>, appelée par la tâche <c>catalogue-refresh</c> et par
/// le bouton de l'admin), sans base : le store, l'usage et Deezer sont des faux, l'horloge est simulée.
/// </summary>
public class RefreshPreviewsHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 23, 0, 0, TimeSpan.Zero);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly FakeTimeProvider _time = new(Now);

    public RefreshPreviewsHandlerTests() => _deezer = new FakeDeezer(_time);
    private readonly FakeStore _store = new();
    private readonly FakeUsage _usage = new();
    private readonly FakeDeezer _deezer;

    private Task<PreviewRefreshResult> RunAsync(int batchSize = 10, double delaySeconds = 0) =>
        RefreshPreviewsHandler.Handle(
            new RefreshPreviews(), _store, _usage, _deezer, new FixedCalendar(Now), _time,
            Options.Create(new RefreshOptions { BatchSize = batchSize, BatchDelay = TimeSpan.FromSeconds(delaySeconds) }),
            NullLogger<RefreshPreviews>.Instance, Ct);

    [Fact]
    public async Task AucunMorceau_RienAVerifier()
    {
        Assert.Equal(new PreviewRefreshResult(0, 0, 0), await RunAsync());
        Assert.Empty(_deezer.Requested);
    }

    [Fact]
    public async Task FlagCorrompu_EstRepare_EtLeRangMisAJour()
    {
        var track = _store.Add(1, PreviewStatus.Missing);
        _deezer.Reply(1, new TrackMetadataLookup.Found(new DeezerTrack(1, "A", "T", "https://p.mp3", null, 2000, 321_000)));

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(1, 1, 0), result);
        Assert.Equal(PreviewStatus.Available, track.PreviewStatus);
        Assert.Equal(321_000, track.DeezerRank);
        Assert.Equal(Now, track.RankUpdatedAt);
    }

    [Fact]
    public async Task ExtraitDisparuChezDeezer_MarqueAbsent()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, new TrackMetadataLookup.Found(new DeezerTrack(1, "A", "T", "", null, null, null)));

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(1, 1, 0), result);
        Assert.Equal(PreviewStatus.Missing, track.PreviewStatus);
    }

    [Fact]
    public async Task MorceauSupprimeChezDeezer_MarqueAbsent()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, new TrackMetadataLookup.NotFound());

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(1, 1, 0), result);
        Assert.Equal(PreviewStatus.Missing, track.PreviewStatus);
    }

    [Fact]
    public async Task DeezerIndisponible_NeModifieRien_ComptePourEchec()
    {
        // Quota, service occupé, panne : l'état est inconnu, jamais « sans preview » (piège 16).
        var available = _store.Add(1, PreviewStatus.Available);
        var missing = _store.Add(2, PreviewStatus.Missing);
        _deezer.Reply(1, new TrackMetadataLookup.Unavailable());
        _deezer.Reply(2, new TrackMetadataLookup.Unavailable());

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(2, 0, 2), result);
        Assert.Equal(PreviewStatus.Available, available.PreviewStatus);
        Assert.Equal(PreviewStatus.Missing, missing.PreviewStatus);
        Assert.Null(available.DeezerRank);
        Assert.Null(available.UpdatedAt);
    }

    [Fact]
    public async Task EtatInchange_PasCompteCommeMisAJour()
    {
        _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, new TrackMetadataLookup.Found(new DeezerTrack(1, "A", "T", "https://p.mp3", null, null, null)));

        Assert.Equal(new PreviewRefreshResult(1, 0, 0), await RunAsync());
    }

    [Fact]
    public async Task LesMorceauxEnCooldownDeDemain_SontExcluesDuControle()
    {
        _store.Add(1, PreviewStatus.Available);
        _store.Add(2, PreviewStatus.Available);
        _usage.Cooldown.Add(2);

        var result = await RunAsync();

        Assert.Equal(1, result.Checked);
        Assert.Equal(DateOnly.FromDateTime(Now.UtcDateTime).AddDays(1), _usage.AskedDay);
        Assert.Equal([2], _store.ExcludedIds);
        Assert.Equal([1L], _deezer.Requested);
    }

    [Fact]
    public async Task Lots_De10_EspacesDAuMoinsLaPauseDemandee()
    {
        for (var i = 1; i <= 25; i++)
            _store.Add(i, PreviewStatus.Available);

        var run = RunAsync(batchSize: 10, delaySeconds: 1.5);
        // L'horloge est simulée : on la fait avancer par petits pas jusqu'à la fin ; chaque requête note l'heure simulée
        // à laquelle elle part, ce qui prouve l'espacement sans dépendre du temps réel.
        while (!run.IsCompleted)
        {
            _time.Advance(TimeSpan.FromSeconds(0.1));
            await Task.Delay(1, Ct);
        }

        var result = await run;

        Assert.Equal(25, result.Checked);
        var batches = _deezer.Stamps.GroupBy(s => s.At).OrderBy(g => g.Key).Select(g => (At: g.Key, Count: g.Count())).ToList();
        Assert.Equal([10, 10, 5], batches.Select(b => b.Count));
        Assert.True(batches[1].At - batches[0].At >= TimeSpan.FromSeconds(1.5));
        Assert.True(batches[2].At - batches[1].At >= TimeSpan.FromSeconds(1.5));
        Assert.Equal(Now, batches[0].At);
    }

    [Fact]
    public async Task LesLotsSontEnregistresUnParUn_AvantLaPauseSuivante()
    {
        for (var i = 1; i <= 4; i++)
            _store.Add(i, PreviewStatus.Missing);

        var result = await RunAsync(batchSize: 2, delaySeconds: 0);

        Assert.Equal(new PreviewRefreshResult(4, 4, 0), result);
        Assert.Equal([2, 2], _store.SavedBatchSizes);
    }

    [Fact]
    public async Task MorceauSupprimePendantLeControle_PasEnregistre_PasCompteCommeMisAJour()
    {
        for (var i = 1; i <= 3; i++)
            _store.Add(i, PreviewStatus.Missing);
        _store.Vanished.Add(2);

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(3, 2, 0), result);
    }

    [Fact]
    public async Task Annulation_EstPropagee()
    {
        _store.Add(1, PreviewStatus.Available);
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();
        _deezer.ThrowOnCancel = true;

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => RefreshPreviewsHandler.Handle(
            new RefreshPreviews(), _store, _usage, _deezer, new FixedCalendar(Now), _time,
            Options.Create(new RefreshOptions()), NullLogger<RefreshPreviews>.Instance, cts.Token));
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!condition())
        {
            Assert.True(DateTime.UtcNow < deadline, "Condition jamais atteinte.");
            await Task.Delay(10, Ct);
        }
    }

    private sealed class FixedCalendar(DateTimeOffset now) : IGameCalendar
    {
        public DateTimeOffset Now => now;

        public DateOnly Today => DateOnly.FromDateTime(now.UtcDateTime);

        public DateTimeOffset StartOf(DateOnly day) => new(day.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
    }

    private sealed class FakeStore : ICatalogueStore
    {
        private readonly List<Track> _tracks = [];

        public IReadOnlyCollection<int> ExcludedIds { get; private set; } = [];

        public List<int> SavedBatchSizes { get; } = [];

        // Morceaux supprimés entre-temps : l'enregistrement les ignore.
        public HashSet<int> Vanished { get; } = [];

        // Les identifiants du faux sont aussi les identifiants Deezer, pour garder les tests lisibles.
        public Track Add(long deezerId, PreviewStatus status)
        {
            var track = Track.Create(new TrackMetadata(deezerId, "Artiste", $"Titre {deezerId}", null, null, null, status), Now.AddDays(-30));
            typeof(Track).GetProperty(nameof(Track.Id))!.SetValue(track, (int)deezerId);
            _tracks.Add(track);
            return track;
        }

        public Task<IReadOnlyList<Track>> ListRefreshCandidatesAsync(IReadOnlyCollection<int> excludedTrackIds, CancellationToken ct)
        {
            ExcludedIds = excludedTrackIds;
            return Task.FromResult<IReadOnlyList<Track>>([.. _tracks.Where(t => !excludedTrackIds.Contains(t.Id) && !t.IsDisabled)]);
        }

        public Task<IReadOnlySet<int>> SaveRefreshedAsync(IReadOnlyCollection<Track> tracks, CancellationToken ct)
        {
            SavedBatchSizes.Add(tracks.Count);
            return Task.FromResult<IReadOnlySet<int>>(tracks.Select(t => t.Id).Where(id => !Vanished.Contains(id)).ToHashSet());
        }

        public ValueTask AddAsync(Track track, CancellationToken ct) => throw new NotSupportedException();

        public void Remove(Track track) => throw new NotSupportedException();

        public Task<Track?> FindAsync(int id, CancellationToken ct) => throw new NotSupportedException();

        public Task<bool> DeezerIdTakenAsync(long deezerTrackId, int? exceptTrackId, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class FakeUsage : ITrackUsage
    {
        public HashSet<int> Cooldown { get; } = [];

        public DateOnly? AskedDay { get; private set; }

        public Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<IReadOnlySet<int>> GetTracksInCooldownAsync(DateOnly day, CancellationToken ct)
        {
            AskedDay = day;
            return Task.FromResult<IReadOnlySet<int>>(Cooldown);
        }
    }

    private sealed class FakeDeezer(FakeTimeProvider time) : ITrackMetadataSource
    {
        private readonly List<(long Id, DateTimeOffset At)> _stamps = [];

        public IReadOnlyList<(long Id, DateTimeOffset At)> Stamps
        {
            get
            {
                lock (_requested)
                    return [.. _stamps];
            }
        }

        private readonly Dictionary<long, TrackMetadataLookup> _replies = [];
        private readonly List<long> _requested = [];

        // Les lots s'exécutent en parallèle (Task.WhenAll) : l'accès à la liste est protégé.
        public IReadOnlyList<long> Requested
        {
            get
            {
                lock (_requested)
                    return [.. _requested];
            }
        }

        public bool ThrowOnCancel { get; set; }

        public void Reply(long id, TrackMetadataLookup lookup) => _replies[id] = lookup;

        public Task<TrackMetadataLookup> GetTrackAsync(long deezerTrackId, CancellationToken ct)
        {
            if (ThrowOnCancel)
                ct.ThrowIfCancellationRequested();
            lock (_requested)
            {
                _requested.Add(deezerTrackId);
                _stamps.Add((deezerTrackId, time.GetUtcNow()));
            }
            return Task.FromResult(_replies.GetValueOrDefault(deezerTrackId)
                ?? new TrackMetadataLookup.Found(new DeezerTrack(deezerTrackId, "A", "T", "https://p.mp3", null, null, null)));
        }
    }
}
