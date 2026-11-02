using System.Diagnostics;
using System.Diagnostics.Metrics;
using InSeconds.Infrastructure.Observability;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>
/// Métriques et traces du calcul des formes d'onde (#474), pour le tableau Grafana « Exploitation » (prod seulement). Aucun identifiant de morceau
/// en étiquette (cardinalité bornée : le résultat). Noms côté Prometheus : <c>inseconds_catalogue_waveforms_total</c> (par <c>outcome</c>),
/// <c>inseconds_catalogue_waveform_runs_total</c> (par <c>result</c>), <c>inseconds_catalogue_waveform_run_duration_seconds</c> et
/// <c>inseconds_catalogue_waveforms_missing</c> (les échecs du dernier passage). Un passage et chacun de ses morceaux
/// sont des spans de la source <see cref="TelemetrySources.Catalogue"/>.
/// </summary>
public sealed class CatalogueTelemetry
{
    public const string MeterName = "InSeconds.Catalogue";

    public const string WaveformsName = "inseconds.catalogue.waveforms";
    public const string RunsName = "inseconds.catalogue.waveform_runs";
    public const string RunDurationName = "inseconds.catalogue.waveform_run_duration";
    public const string MissingName = "inseconds.catalogue.waveforms_missing";

    /// <summary>Étiquette <c>result</c> d'un passage : fini, reporté (ajout récent ou autre calcul en cours), ou sauté faute de verrou (contrôle nocturne).</summary>
    public const string Completed = "completed";
    public const string Deferred = "deferred";
    public const string SkippedBusy = "skipped_busy";

    public static readonly ActivitySource Source = new(TelemetrySources.Catalogue);

    private readonly Counter<long> _waveforms;
    private readonly Counter<long> _runs;
    private readonly Histogram<double> _runDuration;
    private long _missing;

    public CatalogueTelemetry(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _waveforms = meter.CreateCounter<long>(WaveformsName, description: "Formes d'onde traitées, par résultat (outcome : computed, unavailable, failed).");
        _runs = meter.CreateCounter<long>(RunsName, description: "Passages de calcul des formes, par résultat (result : completed, deferred, skipped_busy).");
        _runDuration = meter.CreateHistogram<double>(RunDurationName, unit: "s", description: "Durée d'un passage de calcul des formes.");
        meter.CreateObservableGauge(MissingName, () => Interlocked.Read(ref _missing), description: "Formes en échec au dernier passage (extrait non téléchargé ou illisible), à 0 quand tout va bien.");
    }

    public void Waveform(WaveformOutcome outcome) =>
        _waveforms.Add(1, new KeyValuePair<string, object?>("outcome", outcome.ToString().ToLowerInvariant()));

    public void Run(string result) => _runs.Add(1, new KeyValuePair<string, object?>("result", result));

    public void RunFinished(TimeSpan duration, long missing)
    {
        _runs.Add(1, new KeyValuePair<string, object?>("result", Completed));
        _runDuration.Record(duration.TotalSeconds);
        Interlocked.Exchange(ref _missing, missing);
    }
}
