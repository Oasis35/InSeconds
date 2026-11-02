using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Deezer;
using InSeconds.Waveform;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>Ce qu'a donné le calcul de la forme d'un morceau.</summary>
public enum WaveformOutcome
{
    /// <summary>Calculée et enregistrée.</summary>
    Computed,

    /// <summary>L'extrait n'a pas pu être téléchargé (adresse expirée, CDN en panne) : le morceau sera repris plus tard.</summary>
    Unavailable,

    /// <summary>L'extrait n'est pas un MP3 lisible, ou le morceau a disparu pendant le calcul.</summary>
    Failed,
}

/// <summary>
/// Calcule et enregistre la forme d'un morceau à partir de l'adresse de son extrait, déjà en main (le contrôle nocturne vient de la lire, le
/// passage qui suit un ajout la demande à Deezer). Partagé par les deux : un seul code de calcul. Le son est téléchargé en mémoire, décodé, puis
/// oublié (piège 47).
/// </summary>
public sealed class WaveformCalculator(
    IPreviewAudioSource audio, ICatalogueStore store, TimeProvider time, CatalogueTelemetry telemetry, ILogger<WaveformCalculator> logger)
{
    public async Task<WaveformOutcome> ComputeAsync(Track track, string previewUrl, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(track);
        // Un span par morceau, sous le passage (ou la tâche) qui l'appelle : le temps de téléchargement et de décodage se lit dans la trace.
        using var activity = CatalogueTelemetry.Source.StartActivity("catalogue.waveform");
        activity?.SetTag("catalogue.track_id", track.Id);
        var outcome = await ComputeCoreAsync(track, previewUrl, ct);
        telemetry.Waveform(outcome);
        activity?.SetTag("catalogue.waveform_outcome", outcome.ToString());
        return outcome;
    }

    private async Task<WaveformOutcome> ComputeCoreAsync(Track track, string previewUrl, CancellationToken ct)
    {
        var file = PreviewFile.NameOf(previewUrl);
        if (file is null)
        {
            CatalogueLog.WaveformFailed(logger, track.Id, "adresse d'extrait sans nom de fichier");
            return WaveformOutcome.Failed;
        }

        if (await audio.DownloadAsync(previewUrl, ct) is not PreviewDownload.Downloaded downloaded)
        {
            CatalogueLog.WaveformFailed(logger, track.Id, "extrait non téléchargé");
            return WaveformOutcome.Unavailable;
        }

        byte[] waveform;
        try
        {
            using var stream = new MemoryStream(downloaded.Content);
            waveform = WaveformAnalyzer.Analyze(stream);
        }
        catch (InvalidDataException ex)
        {
            CatalogueLog.WaveformFailed(logger, track.Id, $"extrait illisible ({ex.Message})");
            return WaveformOutcome.Failed;
        }

        track.RecordWaveform(waveform, file, time.GetUtcNow());
        // Un morceau supprimé pendant le calcul n'est plus à enregistrer : sans conséquence.
        return await store.SaveWaveformAsync(track, ct) ? WaveformOutcome.Computed : WaveformOutcome.Failed;
    }
}
