using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Waveform;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;
using Wolverine;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// La forme d'onde des extraits (#474) : calculée par l'étape de <c>catalogue-refresh</c> et par le message différé qui suit l'ajout d'un
/// morceau, jamais deux calculs à la fois (un seul verrou). Le faux Deezer sert un MP3 synthétique (jamais d'audio de Deezer).
/// </summary>
public class WaveformTests(PostgresFixture postgres) : IAsyncLifetime
{
    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    private async Task<byte[]?> WaveformOfAsync(int trackId) =>
        await _app.Api.ScalarAsync<byte[]>($"SELECT waveform FROM catalogue.tracks WHERE id = {trackId}");

    private Task<long> ScheduledMessagesAsync() =>
        _app.Api.ScalarAsync<long>("SELECT count(*) FROM messaging.wolverine_incoming_envelopes WHERE message_type LIKE '%ComputeWaveforms%' AND status = 'Scheduled'");

    private async Task<Dictionary<string, int>> RefreshAsync()
    {
        await using var scope = _app.Api.Services.CreateAsyncScope();
        return Assert.IsType<Dictionary<string, int>>(await scope.ServiceProvider.GetRequiredService<RefreshPreviewsJob>().RunAsync(Ct));
    }

    private async Task InvokeComputeAsync()
    {
        await using var scope = _app.Api.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(new ComputeWaveforms(), Ct);
    }

    [Fact]
    public async Task ControleNocturne_CalculeLaFormeDeTousLesMorceauxSansForme()
    {
        var a = await _app.AddAsync(1001);
        var b = await _app.AddAsync(1002);
        Assert.Null(await WaveformOfAsync(a.Id));

        var report = await RefreshAsync();

        Assert.Equal(2, report["waveforms"]);
        Assert.Equal(0, report["waveformsFailed"]);
        foreach (var id in new[] { a.Id, b.Id })
        {
            var blob = await WaveformOfAsync(id);
            Assert.True(WaveformFormat.IsCurrent(blob));
            Assert.Equal(WaveformFormat.HeaderLength + (WaveformFormat.Seconds * WaveformFormat.BarsPerSecond) + (WaveformFormat.Seconds * WaveformFormat.EnvelopePerSecond), blob!.Length);
        }

        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM catalogue.tracks WHERE id = {a.Id} AND waveform_source = 'test-audio.mp3' AND waveform_computed_at = '{Start:O}'"));
    }

    [Fact]
    public async Task ControleNocturne_NeRecalculePasUneFormeCourante()
    {
        var track = await _app.AddAsync(1001);
        await RefreshAsync();
        _app.Time.Advance(TimeSpan.FromDays(1));

        var report = await RefreshAsync();

        Assert.Equal(0, report["waveforms"]);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM catalogue.tracks WHERE id = {track.Id} AND waveform_computed_at = '{Start:O}'"));
    }

    [Fact]
    public async Task ExtraitRemplace_NomDeFichierDifferent_FormeRecalculee()
    {
        var track = await _app.AddAsync(1001);
        await RefreshAsync();
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET waveform_source = 'ancien-extrait.mp3' WHERE id = {track.Id}");
        _app.Time.Advance(TimeSpan.FromDays(1));

        var report = await RefreshAsync();

        Assert.Equal(1, report["waveforms"]);
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM catalogue.tracks WHERE id = {track.Id} AND waveform_source = 'test-audio.mp3' AND waveform_computed_at > '{Start:O}'"));
    }

    [Fact]
    public async Task AncienFormat_VersionDifferente_FormeRecalculee()
    {
        var track = await _app.AddAsync(1001);
        await RefreshAsync();
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET waveform = set_byte(waveform, 0, 0) WHERE id = {track.Id}");

        var report = await RefreshAsync();

        Assert.Equal(1, report["waveforms"]);
        Assert.True(WaveformFormat.IsCurrent(await WaveformOfAsync(track.Id)));
    }

    [Fact]
    public async Task MorceauSansExtrait_PasDeForme_NiEchec()
    {
        var track = await _app.AddAsync(FakeDeezerNoPreview);

        var report = await RefreshAsync();

        Assert.Equal(0, report["waveforms"]);
        Assert.Equal(0, report["waveformsFailed"]);
        Assert.Null(await WaveformOfAsync(track.Id));
    }

    [Fact]
    public async Task Ajout_PlanifieUnSeulMessageDifferePourPlusieursAjouts_ParLeDelaiDeLaConfiguration()
    {
        await _app.AddAsync(1001);
        await _app.AddAsync(1002);
        await _app.AddAsync(1003);

        // Un message par ajout (le premier ne bloque pas les suivants), mais tous différés : rien n'est calculé avant le délai.
        Assert.Equal(3L, await ScheduledMessagesAsync());
        Assert.Null(await WaveformOfAsync(1));
    }

    [Fact]
    public async Task AjoutSansExtrait_NePlanifieRien()
    {
        await _app.AddAsync(FakeDeezerNoPreview);

        Assert.Equal(0L, await ScheduledMessagesAsync());
    }

    [Fact]
    public async Task Ajout_ComputeOnAddFaux_NePlanifieRien()
    {
        await _app.DisposeAsync();
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["Catalogue:Waveform:ComputeOnAdd"] = "false" });
        _ = _app.Api.Server;

        await _app.AddAsync(1001);

        Assert.Equal(0L, await ScheduledMessagesAsync());
    }

    [Fact]
    public async Task MessageDiffere_TropTotApresUnAjout_SeReplanifieSansCalculer()
    {
        var track = await _app.AddAsync(1001);
        _app.Time.Advance(TimeSpan.FromMinutes(5));

        await InvokeComputeAsync();

        Assert.Null(await WaveformOfAsync(track.Id));
        // Le message d'origine est consommé, un nouveau attend le reste du délai : il glisse jusqu'au dernier ajout.
        Assert.True(await ScheduledMessagesAsync() >= 1);
    }

    [Fact]
    public async Task MessageDiffere_ApresLeDelai_CalculeToutesLesFormesManquantes()
    {
        var a = await _app.AddAsync(1001);
        var b = await _app.AddAsync(1002);
        _app.Time.Advance(TimeSpan.FromMinutes(16));

        await InvokeComputeAsync();

        Assert.True(WaveformFormat.IsCurrent(await WaveformOfAsync(a.Id)));
        Assert.True(WaveformFormat.IsCurrent(await WaveformOfAsync(b.Id)));
    }

    [Fact]
    public async Task MessageDiffere_RienAFaire_NeFaitRien()
    {
        var track = await _app.AddAsync(1001);
        await RefreshAsync();
        var before = await _app.Api.ScalarAsync<DateTime>($"SELECT waveform_computed_at FROM catalogue.tracks WHERE id = {track.Id}");
        _app.Time.Advance(TimeSpan.FromMinutes(16));

        await InvokeComputeAsync();

        Assert.Equal(before, await _app.Api.ScalarAsync<DateTime>($"SELECT waveform_computed_at FROM catalogue.tracks WHERE id = {track.Id}"));
    }

    [Fact]
    public async Task Metriques_ComptentLesFormesParResultat_EtLePassage_SansIdentifiantDeMorceau()
    {
        var meters = _app.Api.Services.GetRequiredService<IMeterFactory>();
        using var waveforms = new MetricCollector<long>(meters, CatalogueTelemetry.MeterName, CatalogueTelemetry.WaveformsName);
        using var runs = new MetricCollector<long>(meters, CatalogueTelemetry.MeterName, CatalogueTelemetry.RunsName);
        using var durations = new MetricCollector<double>(meters, CatalogueTelemetry.MeterName, CatalogueTelemetry.RunDurationName);
        await _app.AddAsync(1001);
        await _app.AddAsync(1002);

        await RefreshAsync();

        var outcomes = waveforms.GetMeasurementSnapshot();
        Assert.Equal(["computed", "computed"], outcomes.Select(m => m.Tags["outcome"]?.ToString()));
        Assert.All(outcomes, m => Assert.Equal(["outcome"], m.Tags.Keys));
        Assert.Equal([CatalogueTelemetry.Completed], runs.GetMeasurementSnapshot().Select(m => m.Tags["result"]?.ToString()));
        Assert.Single(durations.GetMeasurementSnapshot());
    }

    [Fact]
    public async Task Verrou_UnSeulCalculAlaFois_LeSecondNEstPasPris()
    {
        await using var scope = _app.Api.Services.CreateAsyncScope();
        var first = scope.ServiceProvider.GetRequiredService<IWaveformLock>();
        await using var second = _app.Api.Services.CreateAsyncScope();

        await using var held = await first.TryAcquireAsync(Ct);
        var other = await second.ServiceProvider.GetRequiredService<IWaveformLock>().TryAcquireAsync(Ct);

        Assert.NotNull(held);
        Assert.Null(other);
    }

    [Fact]
    public async Task Verrou_LibereALaFinDuCalcul_Reprenable()
    {
        await using var scope = _app.Api.Services.CreateAsyncScope();
        var locks = scope.ServiceProvider.GetRequiredService<IWaveformLock>();

        var held = await locks.TryAcquireAsync(Ct);
        await held!.DisposeAsync();
        await using var again = await locks.TryAcquireAsync(Ct);

        Assert.NotNull(again);
    }

    private static long FakeDeezerNoPreview => InSeconds.Api.Testing.Deezer.FakeDeezerHandler.NoPreviewFrom + 1;
}
