using System.Diagnostics;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using Microsoft.Extensions.Options;
using Wolverine;
using Wolverine.Attributes;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>
/// Calcule la forme des morceaux qui n'en ont pas. Envoyé en différé (<see cref="WaveformOptions.DelayMinutes"/>) à chaque ajout d'un morceau :
/// plusieurs ajouts d'affilée donnent un seul passage, qui prend tous les morceaux sans forme. Le contrôle nocturne (<c>catalogue-refresh</c>) fait
/// le reste (formes d'un extrait remplacé, d'une ancienne version, ou d'un échec).
/// </summary>
public sealed record ComputeWaveforms;

public static class ComputeWaveformsHandler
{
    // Pas de transaction Wolverine : le calcul dure plusieurs minutes (téléchargements espacés) et chaque forme est enregistrée tout de suite par le
    // store (SaveWaveformAsync), comme le contrôle nocturne.
    [NonTransactional]
    public static async Task<OutgoingMessages> Handle(
        ComputeWaveforms message,
        ICatalogueStore store,
        IPreviewProvider previews,
        WaveformCalculator calculator,
        IWaveformLock waveformLock,
        CatalogueTelemetry telemetry,
        TimeProvider time,
        IOptionsMonitor<WaveformOptions> waveformOptions,
        IOptionsMonitor<RefreshOptions> refreshOptions,
        ILogger<ComputeWaveforms> logger,
        CancellationToken ct)
    {
        var outgoing = new OutgoingMessages();
        var delay = TimeSpan.FromMinutes(Math.Max(1, waveformOptions.CurrentValue.DelayMinutes));

        // Rien à calculer : un autre message du même lot est déjà passé par là.
        var latest = await store.LatestAddedWithoutWaveformAsync(ct);
        if (latest is null)
            return outgoing;

        // Le délai glisse jusqu'au dernier ajout : un morceau ajouté il y a moins de DelayMinutes repousse le passage du reste de l'attente.
        var wait = delay - (time.GetUtcNow() - latest.Value);
        if (wait > TimeSpan.Zero)
        {
            outgoing.Delay(new ComputeWaveforms(), wait);
            telemetry.Run(CatalogueTelemetry.Deferred);
            CatalogueLog.WaveformsDeferred(logger, (int)Math.Ceiling(wait.TotalMinutes), "un morceau vient d'être ajouté");
            return outgoing;
        }

        // Le contrôle nocturne tient le verrou : on repasse après le délai (il ne se perd pas, le message est durable).
        await using var held = await waveformLock.TryAcquireAsync(ct);
        if (held is null)
        {
            outgoing.Delay(new ComputeWaveforms(), delay);
            telemetry.Run(CatalogueTelemetry.Deferred);
            CatalogueLog.WaveformsDeferred(logger, (int)delay.TotalMinutes, "un autre calcul de formes est en cours");
            return outgoing;
        }

        var started = Stopwatch.GetTimestamp();
        using var activity = CatalogueTelemetry.Source.StartActivity("catalogue.waveforms.run");
        activity?.SetTag("catalogue.trigger", "add");
        var computed = 0;
        var failed = 0;
        var unavailable = 0;
        var settings = refreshOptions.CurrentValue;
        var batchSize = Math.Max(1, settings.BatchSize);
        var tracks = await store.ListWithoutWaveformAsync(ct);

        for (var offset = 0; offset < tracks.Count; offset += batchSize)
        {
            // Même cadence que le contrôle des extraits : un appel Deezer par morceau (l'adresse fraîche), lots espacés (piège 16).
            if (offset > 0)
                await Task.Delay(settings.BatchDelay, time, ct);

            var batch = tracks.Skip(offset).Take(batchSize).ToList();
            var lookups = await Task.WhenAll(batch.Select(t => previews.GetPreviewAsync(t.DeezerTrackId, ct)));
            for (var i = 0; i < batch.Count; i++)
            {
                if (lookups[i] is not PreviewLookup.Found found)
                {
                    unavailable++;
                    continue;
                }

                switch (await calculator.ComputeAsync(batch[i], found.Url, ct))
                {
                    case WaveformOutcome.Computed: computed++; break;
                    case WaveformOutcome.Unavailable: unavailable++; break;
                    default: failed++; break;
                }
            }
        }

        CatalogueLog.WaveformsComputed(logger, computed, failed, unavailable, (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        telemetry.RunFinished(Stopwatch.GetElapsedTime(started), failed + unavailable);
        activity?.SetTag("catalogue.waveforms_computed", computed);

        // Un morceau ajouté pendant le passage n'a pas été pris : son propre message le prendra.
        return outgoing;
    }
}
