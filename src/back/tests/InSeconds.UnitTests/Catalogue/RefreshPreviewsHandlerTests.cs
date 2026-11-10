using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using InSeconds.Waveform;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.UnitTests.Catalogue;

/// <summary>
/// Le contrôle des extraits (commande <c>RefreshPreviews</c>, appelée par la tâche <c>catalogue-refresh</c> et par
/// le bouton de l'admin), sans base : le store et Deezer sont des faux, l'horloge est simulée.
/// </summary>
public class RefreshPreviewsHandlerTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 23, 0, 0, TimeSpan.Zero);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly FakeTimeProvider _time = new(Now);

    public RefreshPreviewsHandlerTests()
    {
        _deezer = new FakeDeezer(_time);
        _albums = new FakeAlbums(_time);
        _calculator = new WaveformCalculator(_audio, _store, _time, _telemetry, NullLogger<WaveformCalculator>.Instance);
    }

    private readonly FakeStore _store = new();
    private readonly FakeAlbums _albums;
    private readonly FakeDeezer _deezer;
    private readonly FakeAudio _audio = new();
    private readonly FakeLock _lock = new();
    private readonly CatalogueTelemetry _telemetry = new(new ServiceCollection().AddMetrics().BuildServiceProvider().GetRequiredService<IMeterFactory>());
    private readonly WaveformCalculator _calculator;

    // Les formes d'onde ont leurs propres tests (région plus bas) : ici, le compte rendu du contrôle des extraits seul.
    private async Task<PreviewRefreshResult> RunAsync(int batchSize = 10, double delaySeconds = 0) =>
        WithoutWaveforms(await RunWithWaveformsAsync(new MutableMonitor(new RefreshOptions { BatchSize = batchSize, BatchDelay = TimeSpan.FromSeconds(delaySeconds) })));

    private async Task<PreviewRefreshResult> RunAsync(IOptionsMonitor<RefreshOptions> options) => WithoutWaveforms(await RunWithWaveformsAsync(options));

    private static PreviewRefreshResult WithoutWaveforms(PreviewRefreshResult result) => result with { WaveformsComputed = 0, WaveformsFailed = 0 };

    private Task<PreviewRefreshResult> RunWithWaveformsAsync(IOptionsMonitor<RefreshOptions>? options = null) =>
        RefreshPreviewsHandler.Handle(
            new RefreshPreviews(), _store, _deezer, _albums, _calculator, _lock, _telemetry, _time,
            options ?? new MutableMonitor(new RefreshOptions { BatchDelay = TimeSpan.Zero }), NullLogger<RefreshPreviews>.Instance, Ct);

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
        _deezer.Reply(1, new TrackMetadataLookup.Found(new DeezerTrack(1, "A", "T", "https://p.mp3", null, 2000, 321_000, null)));

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(1, 1, 0), result);
        Assert.Equal(PreviewStatus.Available, track.PreviewStatus);
        Assert.Equal(321_000, track.DeezerRank);
        Assert.Equal(Now, track.RankUpdatedAt);
    }

    // ---------- Genres : un appel par album, rattrapage ----------

    private static TrackMetadataLookup.Found OnAlbum(long deezerId, long? albumId) =>
        new(new DeezerTrack(deezerId, "A", "T", "https://p.mp3", null, null, null, albumId));

    [Fact]
    public async Task Genres_UnAppelParAlbum_QuelQueSoitLeNombreDeMorceaux_EtChaqueAlbumEstEnregistre()
    {
        _store.Add(1, PreviewStatus.Available);
        _store.Add(2, PreviewStatus.Available);
        _store.Add(3, PreviewStatus.Available);
        _deezer.Reply(1, OnAlbum(1, 7));
        _deezer.Reply(2, OnAlbum(2, 7));
        _deezer.Reply(3, OnAlbum(3, 8));
        _albums.Reply(7, new AlbumLookup.Found([new DeezerGenre(132, "Pop"), new DeezerGenre(116, "Rap/Hip Hop")]));
        _albums.Reply(8, new AlbumLookup.Found([new DeezerGenre(152, "Rock")]));

        await RunAsync();

        Assert.Equal([7L, 8L], _albums.Requested.Order());
        Assert.Equal([(7L, "Pop|Rap/Hip Hop"), (8L, "Rock")], _store.SavedAlbums.Order().ToArray());
    }

    [Fact]
    public async Task Genres_DejaLus_NeSontPasRedemandes_MemeSiLAlbumN_EnAvaitAucun()
    {
        _store.Add(1, PreviewStatus.Available, albumId: 7, genresRead: true);
        _deezer.Reply(1, OnAlbum(1, 7));

        await RunAsync();

        Assert.Empty(_albums.Requested);
        Assert.Empty(_store.SavedAlbums);
    }

    [Fact]
    public async Task Genres_AlbumIndisponible_NeChangeRien_EtSeraRepris()
    {
        _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, OnAlbum(1, 7));
        _albums.Reply(7, new AlbumLookup.Unavailable());

        await RunAsync();

        Assert.Equal([7L], _albums.Requested);
        Assert.Empty(_store.SavedAlbums);
    }

    [Fact]
    public async Task Genres_AlbumSupprimeChezDeezer_LaisseLeGenreVide()
    {
        _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, OnAlbum(1, 7));
        _albums.Reply(7, new AlbumLookup.NotFound());

        await RunAsync();

        Assert.Equal([(7L, "")], _store.SavedAlbums);
    }

    [Fact]
    public async Task Genres_MorceauSansAlbum_AucunAppel()
    {
        _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, OnAlbum(1, null));

        await RunAsync();

        Assert.Empty(_albums.Requested);
    }

    [Fact]
    public async Task Genres_LAlbumLuAvecLeMorceauEstEnregistreAvecLui()
    {
        _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, OnAlbum(1, 7));
        _albums.Reply(7, new AlbumLookup.Found([]));

        await RunAsync();

        Assert.Equal([7L], _store.SavedAlbumIdsOfTracks);
    }

    [Fact]
    public async Task Genres_LesAlbumsSontLusParLotsEspaces_ApresLesMorceaux()
    {
        for (var id = 1; id <= 4; id++)
        {
            _store.Add(id, PreviewStatus.Available);
            _deezer.Reply(id, OnAlbum(id, 100 + id));
            _albums.Reply(100 + id, new AlbumLookup.Found([]));
        }

        var run = RunAsync(batchSize: 2, delaySeconds: 2);
        // Chaque pause du contrôle se franchit en avançant l'horloge simulée.
        while (!run.IsCompleted)
        {
            _time.Advance(TimeSpan.FromSeconds(2));
            await Task.Delay(10, Ct);
        }

        await run;

        var lastTrackAt = _deezer.Stamps.Max(s => s.At);
        var albumStamps = _albums.Stamps.OrderBy(s => s.At).ToList();
        Assert.Equal(4, albumStamps.Count);
        // Deux albums par lot, une pause entre les lots, et une pause entre le dernier lot de morceaux et le premier d'albums.
        Assert.Equal(albumStamps[0].At, albumStamps[1].At);
        Assert.Equal(albumStamps[2].At, albumStamps[3].At);
        Assert.True(albumStamps[2].At - albumStamps[1].At >= TimeSpan.FromSeconds(2));
        Assert.True(albumStamps[0].At - lastTrackAt >= TimeSpan.FromSeconds(2));
        Assert.Equal(4, _albums.Requested.Count);
    }

    [Fact]
    public async Task ExtraitDisparuChezDeezer_MarqueAbsent()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, new TrackMetadataLookup.Found(new DeezerTrack(1, "A", "T", "", null, null, null, null)));

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
        _deezer.Reply(1, new TrackMetadataLookup.Found(new DeezerTrack(1, "A", "T", "https://p.mp3", null, null, null, null)));

        Assert.Equal(new PreviewRefreshResult(1, 0, 0), await RunAsync());
    }

    [Fact]
    public async Task TousLesMorceauxSontControles_SaufLesDesactives_LeCooldownNExcluPlusRien()
    {
        // Un mode (un run) peut tirer n'importe quel morceau, ceux du cooldown du Daily compris : le contrôle ne connaît plus le cooldown.
        _store.Add(1, PreviewStatus.Available);
        _store.Add(2, PreviewStatus.Available);
        _store.Add(3, PreviewStatus.Available).Disable(Now);

        var result = await RunAsync();

        Assert.Equal(2, result.Checked);
        Assert.Equal([1L, 2L], _deezer.Requested.Order());
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
    public async Task LaCadence_EstRelueAChaqueControle_SansRedemarrage()
    {
        for (var i = 1; i <= 4; i++)
            _store.Add(i, PreviewStatus.Available);
        var options = new MutableMonitor(new RefreshOptions { BatchSize = 2, BatchDelay = TimeSpan.Zero });

        await RunAsync(options);
        options.Value = new RefreshOptions { BatchSize = 4, BatchDelay = TimeSpan.Zero };
        await RunAsync(options);

        Assert.Equal([2, 2, 4], _store.SavedBatchSizes);
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
            new RefreshPreviews(), _store, _deezer, _albums, _calculator, _lock, _telemetry, _time, new MutableMonitor(new RefreshOptions()),
            NullLogger<RefreshPreviews>.Instance, cts.Token));
    }

    // ---------- Formes d'onde : calculées pendant le contrôle, avec l'adresse que Deezer vient de donner ----------

    private static DeezerTrack WithPreview(long id, string url) => new(id, "A", "T", url, null, null, null, null);

    private static byte[] Synthetic() => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", "synthetic.mp3"));

    private static byte[] CurrentBlob() => WaveformAnalyzer.Analyze(new MemoryStream(Synthetic()));

    [Fact]
    public async Task SansForme_EstCalculee_AvecLAdresseDuControle_EtLeNomDuFichierGarde()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, new TrackMetadataLookup.Found(WithPreview(1, "https://cdnt-preview.dzcdn.net/api/1/1/a/b/abc123.mp3?hdnea=exp=1~hmac=x")));

        var result = await RunWithWaveformsAsync();

        Assert.Equal(1, result.WaveformsComputed);
        Assert.Equal(0, result.WaveformsFailed);
        Assert.True(WaveformFormat.IsCurrent(track.Waveform));
        Assert.Equal("abc123.mp3", track.WaveformSource);
        Assert.Equal(Now, track.WaveformComputedAt);
        // L'adresse du contrôle sert telle quelle : aucun second appel à Deezer pour la forme.
        Assert.Equal([1L], _deezer.Requested);
        Assert.Single(_audio.Downloaded);
    }

    [Fact]
    public async Task FormeAJour_NeTelechargeRien()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        track.RecordWaveform(CurrentBlob(), "p.mp3", Now.AddDays(-1));

        var result = await RunWithWaveformsAsync();

        Assert.Equal(0, result.WaveformsComputed);
        Assert.Empty(_audio.Downloaded);
        Assert.Equal(Now.AddDays(-1), track.WaveformComputedAt);
    }

    [Fact]
    public async Task ExtraitRemplace_LeNomDuFichierChange_LaFormeEstRecalculee()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        track.RecordWaveform(CurrentBlob(), "ancien.mp3", Now.AddDays(-1));
        _deezer.Reply(1, new TrackMetadataLookup.Found(WithPreview(1, "https://cdnt-preview.dzcdn.net/nouveau.mp3?hdnea=exp=1")));

        var result = await RunWithWaveformsAsync();

        Assert.Equal(1, result.WaveformsComputed);
        Assert.Equal("nouveau.mp3", track.WaveformSource);
        Assert.Equal(Now, track.WaveformComputedAt);
    }

    [Fact]
    public async Task SeulLaSignatureChange_LaFormeEstGardee()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        track.RecordWaveform(CurrentBlob(), "p.mp3", Now.AddDays(-1));
        _deezer.Reply(1, new TrackMetadataLookup.Found(WithPreview(1, "https://cdnt-preview.dzcdn.net/p.mp3?hdnea=exp=2~hmac=autre")));

        var result = await RunWithWaveformsAsync();

        Assert.Equal(0, result.WaveformsComputed);
        Assert.Empty(_audio.Downloaded);
    }

    [Fact]
    public async Task AncienneVersionDuFormat_EstRecalculee()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        var old = CurrentBlob();
        old[0] = (byte)(WaveformFormat.CurrentVersion - 1);
        track.RecordWaveform(old, "p.mp3", Now.AddDays(-1));

        var result = await RunWithWaveformsAsync();

        Assert.Equal(1, result.WaveformsComputed);
        Assert.True(WaveformFormat.IsCurrent(track.Waveform));
    }

    [Fact]
    public async Task ExtraitNonTelecharge_LeControleReussit_LaFormeEstCompteeEnEchec()
    {
        var track = _store.Add(1, PreviewStatus.Missing);
        _audio.Unavailable = true;

        var result = await RunWithWaveformsAsync();

        // L'état de l'extrait est bien mis à jour : un échec de forme ne fait jamais échouer le contrôle.
        Assert.Equal(new PreviewRefreshResult(1, 1, 0, 0, 1), result);
        Assert.Equal(PreviewStatus.Available, track.PreviewStatus);
        Assert.Null(track.Waveform);
    }

    [Fact]
    public async Task ExtraitIllisible_EstUnEchec_PasUneException()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        _audio.Content = new byte[2048];

        var result = await RunWithWaveformsAsync();

        Assert.Equal(1, result.WaveformsFailed);
        Assert.Null(track.Waveform);
    }

    [Fact]
    public async Task MorceauSansExtrait_NaPasDeForme()
    {
        _store.Add(1, PreviewStatus.Available);
        _deezer.Reply(1, new TrackMetadataLookup.NotFound());

        var result = await RunWithWaveformsAsync();

        Assert.Equal(0, result.WaveformsComputed + result.WaveformsFailed);
        Assert.Empty(_audio.Downloaded);
    }

    [Fact]
    public async Task UnPassageDeFormesEnCours_LeControleAttendLeVerrou_PuisFait()
    {
        var track = _store.Add(1, PreviewStatus.Available);
        _lock.BusyAttempts = 3;

        var run = RunWithWaveformsAsync();
        while (!run.IsCompleted)
        {
            _time.Advance(TimeSpan.FromSeconds(10));
            await Task.Yield();
        }

        Assert.Equal(1, (await run).WaveformsComputed);
        Assert.NotNull(track.Waveform);
        Assert.Equal(4, _lock.Attempts);
    }

    [Fact]
    public async Task VerrouJamaisLibere_LeControleDesExtraitsAQuandMemeLieu_SansLesFormes()
    {
        var track = _store.Add(1, PreviewStatus.Missing);
        _lock.BusyAttempts = int.MaxValue;

        var run = RunWithWaveformsAsync();
        while (!run.IsCompleted)
        {
            _time.Advance(TimeSpan.FromSeconds(10));
            await Task.Yield();
        }

        var result = await run;
        Assert.Equal(new PreviewRefreshResult(1, 1, 0, 0, 0), result);
        Assert.Equal(PreviewStatus.Available, track.PreviewStatus);
        Assert.Null(track.Waveform);
        Assert.Empty(_audio.Downloaded);
    }

    private sealed class FakeAudio : IPreviewAudioSource
    {
        public List<string> Downloaded { get; } = [];

        public bool Unavailable { get; set; }

        public byte[] Content { get; set; } = Synthetic();

        public Task<PreviewDownload> DownloadAsync(string previewUrl, CancellationToken ct = default)
        {
            Downloaded.Add(previewUrl);
            return Task.FromResult<PreviewDownload>(Unavailable ? new PreviewDownload.Unavailable() : new PreviewDownload.Downloaded(Content));
        }
    }

    private sealed class FakeLock : IWaveformLock
    {
        public int BusyAttempts { get; set; }

        public int Attempts { get; private set; }

        public Task<IAsyncDisposable?> TryAcquireAsync(CancellationToken ct) =>
            Task.FromResult<IAsyncDisposable?>(++Attempts <= BusyAttempts ? null : new Held());

        private sealed class Held : IAsyncDisposable
        {
            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }

    private sealed class FakeStore : ICatalogueStore
    {
        private readonly List<Track> _tracks = [];

        public List<int> SavedBatchSizes { get; } = [];

        // Les genres d'un album en un seul texte (« Pop|Rock ») : un tuple compare un tableau par référence, pas par contenu.
        public List<(long AlbumId, string Genres)> SavedAlbums { get; } = [];

        public List<long> SavedAlbumIdsOfTracks { get; } = [];

        // Morceaux supprimés entre-temps : l'enregistrement les ignore.
        public HashSet<int> Vanished { get; } = [];

        // Les identifiants du faux sont aussi les identifiants Deezer, pour garder les tests lisibles.
        public Track Add(long deezerId, PreviewStatus status, long? albumId = null, bool genresRead = false)
        {
            var track = Track.Create(new TrackMetadata(deezerId, "Artiste", $"Titre {deezerId}", null, null, null, status, albumId), Now.AddDays(-30));
            if (genresRead)
                track.RecordGenres([], Now.AddDays(-30));
            typeof(Track).GetProperty(nameof(Track.Id))!.SetValue(track, (int)deezerId);
            _tracks.Add(track);
            return track;
        }

        public Task<IReadOnlyList<Track>> ListRefreshCandidatesAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<Track>>([.. _tracks.Where(t => !t.IsDisabled)]);

        public Task<Genre> FindOrAddGenreByNameAsync(string name, CancellationToken ct) => throw new NotSupportedException();

        public Task<IReadOnlyList<Genre>> EnsureGenresAsync(IReadOnlyCollection<GenreRef> genres, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task SaveAlbumGenresAsync(long albumId, IReadOnlyCollection<GenreRef> genres, DateTimeOffset now, CancellationToken ct)
        {
            SavedAlbums.Add((albumId, string.Join("|", genres.Select(g => g.Name))));
            return Task.CompletedTask;
        }

        public Task<IReadOnlySet<int>> SaveRefreshedAsync(IReadOnlyCollection<Track> tracks, CancellationToken ct)
        {
            SavedBatchSizes.Add(tracks.Count);
            SavedAlbumIdsOfTracks.AddRange(tracks.Select(t => t.AlbumId).OfType<long>());
            return Task.FromResult<IReadOnlySet<int>>(tracks.Select(t => t.Id).Where(id => !Vanished.Contains(id)).ToHashSet());
        }

        public ValueTask AddAsync(Track track, CancellationToken ct) => throw new NotSupportedException();

        public void Remove(Track track) => throw new NotSupportedException();

        public Task<Track?> FindAsync(int id, CancellationToken ct) => throw new NotSupportedException();

        public Task<Track?> FindWithGenresAsync(int id, CancellationToken ct) => throw new NotSupportedException();

        public Task<bool> DeezerIdTakenAsync(long deezerTrackId, int? exceptTrackId, CancellationToken ct) => throw new NotSupportedException();

        public Task<Track?> FindWithThemesAsync(int id, CancellationToken ct) => throw new NotSupportedException();

        public Task<IReadOnlyList<Theme>> FindThemesAsync(IReadOnlyCollection<int> ids, CancellationToken ct) => throw new NotSupportedException();

        public ValueTask AddThemeAsync(Theme theme, CancellationToken ct) => throw new NotSupportedException();

        public void RemoveTheme(Theme theme) => throw new NotSupportedException();

        public Task<Theme?> FindThemeAsync(int id, CancellationToken ct) => throw new NotSupportedException();

        public Task<bool> ThemeNameTakenAsync(string name, int? exceptThemeId, CancellationToken ct) => throw new NotSupportedException();

        public Task<bool> ThemeInUseAsync(int themeId, CancellationToken ct) => throw new NotSupportedException();

        public Task<int> CountThemeTracksAsync(int themeId, CancellationToken ct) => throw new NotSupportedException();

        // La forme : le faux garde le morceau, qui porte déjà ce que RecordWaveform y a écrit.
        public Task<bool> SaveWaveformAsync(Track track, CancellationToken ct) => Task.FromResult(!Vanished.Contains(track.Id));

        public Task<IReadOnlyList<Track>> ListWithoutWaveformAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<Track>>([.. _tracks.Where(t => !t.IsDisabled && t.HasPreview && t.Waveform is null)]);

        public Task<DateTimeOffset?> LatestAddedWithoutWaveformAsync(CancellationToken ct) =>
            Task.FromResult(_tracks.Where(t => !t.IsDisabled && t.HasPreview && t.Waveform is null).Select(t => (DateTimeOffset?)t.CreatedAt).Max());
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
                ?? new TrackMetadataLookup.Found(new DeezerTrack(deezerTrackId, "A", "T", "https://cdnt-preview.dzcdn.net/p.mp3?hdnea=exp=1", null, null, null, null)));
        }
    }

    private sealed class FakeAlbums(FakeTimeProvider time) : IAlbumSource
    {
        private readonly Dictionary<long, AlbumLookup> _replies = [];
        private readonly List<long> _requested = [];
        private readonly List<(long Id, DateTimeOffset At)> _stamps = [];

        public IReadOnlyList<long> Requested
        {
            get
            {
                lock (_requested)
                    return [.. _requested];
            }
        }

        public IReadOnlyList<(long Id, DateTimeOffset At)> Stamps
        {
            get
            {
                lock (_requested)
                    return [.. _stamps];
            }
        }

        public void Reply(long albumId, AlbumLookup lookup) => _replies[albumId] = lookup;

        public Task<AlbumLookup> GetAlbumAsync(long albumId, CancellationToken ct = default)
        {
            lock (_requested)
            {
                _requested.Add(albumId);
                _stamps.Add((albumId, time.GetUtcNow()));
            }

            return Task.FromResult(_replies.GetValueOrDefault(albumId) ?? new AlbumLookup.Found([]));
        }
    }

    /// <summary>Un réglage relu à chaud : <see cref="Value"/> se change entre deux contrôles, comme une ligne de <c>infra.settings</c>.</summary>
    private sealed class MutableMonitor(RefreshOptions value) : IOptionsMonitor<RefreshOptions>
    {
        public RefreshOptions Value { get; set; } = value;

        public RefreshOptions CurrentValue => Value;

        public RefreshOptions Get(string? name) => Value;

        public IDisposable? OnChange(Action<RefreshOptions, string?> listener) => null;
    }
}
