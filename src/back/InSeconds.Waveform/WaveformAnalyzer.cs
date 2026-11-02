using NLayer;

namespace InSeconds.Waveform;

/// <summary>
/// Calcule la forme d'un extrait MP3 : l'énergie (RMS) de chaque tranche de 1/6 s, qui fait les barres de la waveform, et l'énergie des basses
/// (passe-bas à un pôle sous 150 Hz, image par image à 60 Hz), qui fait danser le bouton. Le son est décodé en flux et oublié aussitôt :
/// rien n'est écrit sur disque, seuls les nombres sont gardés (piège 47).
/// </summary>
public static class WaveformAnalyzer
{
    /// <summary>Fréquence de coupure du passe-bas qui garde les basses (grosse caisse, basse).</summary>
    private const double BassCutoffHz = 150;

    /// <summary>
    /// Décode le flux (les 30 premières secondes au plus) et rend le blob de la forme (cf. <see cref="WaveformFormat"/>). Le flux est lu
    /// jusqu'à la durée couverte, pas plus loin ; un son plus court laisse des zéros pour le reste.
    /// </summary>
    /// <exception cref="InvalidDataException">Le flux n'est pas un MP3 lisible, ou il est vide.</exception>
    public static byte[] Analyze(Stream mp3)
    {
        ArgumentNullException.ThrowIfNull(mp3);
        try
        {
            return AnalyzeCore(mp3);
        }
        // NLayer lève plusieurs types d'exception sur un flux illisible ; un seul type pour l'appelant.
        catch (Exception ex) when (ex is not InvalidDataException and not OperationCanceledException)
        {
            throw new InvalidDataException("L'extrait n'est pas un MP3 lisible.", ex);
        }
    }

    private static byte[] AnalyzeCore(Stream mp3)
    {
        using var file = new MpegFile(mp3);
        int rate = file.SampleRate, channels = file.Channels;
        if (rate <= 0 || channels <= 0)
            throw new InvalidDataException("Extrait sans son.");

        const int seconds = WaveformFormat.Seconds;
        var barCount = seconds * WaveformFormat.BarsPerSecond;
        var frameCount = seconds * WaveformFormat.EnvelopePerSecond;
        var maxSamples = (long)seconds * rate;
        var alpha = 1 - Math.Exp(-2 * Math.PI * BassCutoffHz / rate);

        var barEnergy = new double[barCount];
        var barLength = new long[barCount];
        var frameEnergy = new double[frameCount];
        var frameLength = new long[frameCount];

        var buffer = new float[4096 * channels];
        long index = 0;
        double low = 0;
        while (index < maxSamples)
        {
            var read = file.ReadSamples(buffer, 0, buffer.Length);
            if (read <= 0)
                break;

            for (var i = 0; i + channels <= read && index < maxSamples; i += channels, index++)
            {
                // Mono : la moyenne des canaux.
                double sample = 0;
                for (var c = 0; c < channels; c++)
                    sample += buffer[i + c];
                sample /= channels;

                var bar = (int)(index * barCount / maxSamples);
                barEnergy[bar] += sample * sample;
                barLength[bar]++;

                low += alpha * (sample - low);
                var frame = (int)(index * frameCount / maxSamples);
                frameEnergy[frame] += low * low;
                frameLength[frame]++;
            }
        }

        if (index == 0)
            throw new InvalidDataException("Extrait vide.");

        return WaveformFormat.Write(new WaveformData(
            seconds, WaveformFormat.BarsPerSecond, WaveformFormat.EnvelopePerSecond,
            Scale(barEnergy, barLength), Scale(frameEnergy, frameLength)));
    }

    /// <summary>La racine de l'énergie moyenne de chaque tranche, rapportée à la plus forte (0 à 255). Tout à zéro si le son est muet.</summary>
    private static byte[] Scale(double[] energy, long[] length)
    {
        var rms = new double[energy.Length];
        for (var i = 0; i < energy.Length; i++)
            rms[i] = length[i] > 0 ? Math.Sqrt(energy[i] / length[i]) : 0;

        var max = rms.Max();
        var scaled = new byte[rms.Length];
        if (max <= 0)
            return scaled;

        for (var i = 0; i < rms.Length; i++)
            scaled[i] = (byte)Math.Round(255 * rms[i] / max);
        return scaled;
    }
}
