using InSeconds.Waveform;

namespace InSeconds.UnitTests.Waveform;

/// <summary>
/// La forme d'un extrait qui n'a pas la forme des fixtures (stéréo 44,1 kHz) : mono, 32 et 48 kHz, plus court que la fenêtre de 30 s, plus long.
/// Le décodeur reçoit des trames MPEG-1 couche III de silence, fabriquées ici (en-tête, informations latérales à zéro) : aucun encodeur n'est nécessaire et
/// aucun audio de Deezer n'entre dans le dépôt (piège 47). Du silence ne dit rien de l'énergie ni du découpage en tranches (les valeurs, elles, sont tenues par
/// <c>WaveformAnalyzerTests</c>) : ces tests prouvent que le décodage tient pour chaque format, que le blob garde sa taille et que le flux n'est pas lu au-delà
/// de la fenêtre de 30 s (piège 50 : MPEG-1, 44,1 kHz est le cas nominal, les autres ne doivent pas casser le calcul).
/// </summary>
public class WaveformAnalyzerFormatsTests
{
    /// <summary>Octet 3 de l'en-tête : débit 128 kb/s, fréquence d'échantillonnage (00 : 44,1 kHz, 01 : 48 kHz, 10 : 32 kHz), sans bourrage.</summary>
    private static byte RateByte(int hz) => hz switch { 44_100 => 0x90, 48_000 => 0x94, 32_000 => 0x98, _ => throw new ArgumentOutOfRangeException(nameof(hz)) };

    /// <summary>Des trames MPEG-1 couche III de silence : chacune porte 1152 échantillons par canal.</summary>
    private static byte[] SilentMp3(int sampleRate, bool mono, int frames)
    {
        // 144 × débit ÷ fréquence, sans bourrage.
        var frameLength = 144 * 128_000 / sampleRate;
        var frame = new byte[frameLength];
        frame[0] = 0xFF;
        frame[1] = 0xFB; // synchro, MPEG-1, couche III, sans CRC
        frame[2] = RateByte(sampleRate);
        frame[3] = mono ? (byte)0xC0 : (byte)0x00; // mono, ou stéréo
        // Le reste (informations latérales, données) est à zéro : aucune donnée principale, un silence.
        var mp3 = new byte[frameLength * frames];
        for (var i = 0; i < frames; i++)
            frame.CopyTo(mp3, i * frameLength);
        return mp3;
    }

    private static int FramesFor(double seconds, int sampleRate) => (int)Math.Ceiling(seconds * sampleRate / 1152);

    private static WaveformData Analyze(byte[] mp3)
    {
        using var stream = new MemoryStream(mp3);
        return WaveformFormat.Parse(WaveformAnalyzer.Analyze(stream))!;
    }

    [Theory]
    [InlineData(44_100, false)]
    [InlineData(44_100, true)]
    [InlineData(48_000, false)]
    [InlineData(48_000, true)]
    [InlineData(32_000, false)]
    [InlineData(32_000, true)]
    public void UnExtraitDeTouteFrequenceEtDeToutCanal_DonneUnBlobDeLaTailleFixe(int sampleRate, bool mono)
    {
        var data = Analyze(SilentMp3(sampleRate, mono, FramesFor(5, sampleRate)));

        // 30 s × 6 barres et 30 s × 60 valeurs, quelle que soit la fréquence : la taille du blob est fixe.
        Assert.Equal(180, data.Bars.Length);
        Assert.Equal(1800, data.Envelope.Length);
        Assert.All(data.Bars, bar => Assert.Equal(0, bar));
    }

    [Fact]
    public void UnExtraitTresCourt_NeLeveRien_EtLaisseDesZerosPourLeReste()
    {
        // Douze trames : environ 0,3 s. La suite de la fenêtre est à zéro (rien n'a été décodé).
        var data = Analyze(SilentMp3(44_100, mono: true, frames: 12));

        Assert.Equal(180, data.Bars.Length);
        Assert.All(data.Bars, bar => Assert.Equal(0, bar));
        Assert.All(data.Envelope, value => Assert.Equal(0, value));
    }

    [Fact]
    public void UnExtraitPlusLongQueLaFenetre_EstLuJusqueLaFenetreSeulement()
    {
        // 45 s : le flux n'est pas lu en entier (la forme couvre 30 s), et le blob garde sa taille.
        var mp3 = SilentMp3(44_100, mono: false, FramesFor(45, 44_100));
        using var stream = new MemoryStream(mp3);

        var blob = WaveformAnalyzer.Analyze(stream);

        Assert.Equal(4 + 180 + 1800, blob.Length);
        Assert.True(stream.Position < stream.Length, "Le flux a été lu jusqu'au bout alors que la forme ne couvre que les 30 premières secondes.");
        // Au moins la fenêtre elle-même a été lue (environ 2/3 du flux), pas quelques octets.
        Assert.True(stream.Position > stream.Length / 2);
    }

    [Fact]
    public void UnFluxAuMilieuDUnExtrait_Tronque_DonneUneFormeSansLever()
    {
        // Le téléchargement s'est arrêté au milieu d'une trame : la dernière trame coupée ne fait pas échouer le calcul (le décodeur la décode quand même).
        var mp3 = SilentMp3(44_100, mono: false, FramesFor(2, 44_100));

        var data = Analyze(mp3[..^100]);

        Assert.Equal(180, data.Bars.Length);
    }
}
