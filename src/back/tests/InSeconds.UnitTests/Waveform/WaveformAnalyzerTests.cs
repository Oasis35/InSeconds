using InSeconds.Waveform;

namespace InSeconds.UnitTests.Waveform;

/// <summary>
/// La forme d'un extrait, calculée sur un MP3 synthétique de 6 s : 2 s d'une basse à 60 Hz forte, 2 s d'un aigu à 2 kHz faible (un quart de
/// l'amplitude), 2 s de silence.
/// </summary>
public class WaveformAnalyzerTests
{
    private static byte[] Synthetic() => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fixtures", "synthetic.mp3"));

    private static WaveformData Analyze()
    {
        using var stream = new MemoryStream(Synthetic());
        return WaveformFormat.Parse(WaveformAnalyzer.Analyze(stream))!;
    }

    [Fact]
    public void LeBlob_AUneTailleFixe_EtLEnTeteDeLaVersionCourante()
    {
        using var stream = new MemoryStream(Synthetic());
        var blob = WaveformAnalyzer.Analyze(stream);

        // 4 octets d'en-tête + 30 s × 6 barres + 30 s × 60 valeurs de basses.
        Assert.Equal(4 + 180 + 1800, blob.Length);
        Assert.Equal(WaveformFormat.CurrentVersion, blob[0]);
        Assert.Equal(30, blob[1]);
        Assert.True(WaveformFormat.IsCurrent(blob));
    }

    [Fact]
    public void LesBarres_SuiventLEnergieDuSon()
    {
        var bars = Analyze().Bars;

        // Barres de 1/6 s : 12 barres par segment de 2 s. On évite la barre du bord, où le codeur MP3 étale un peu.
        Assert.Equal(255, bars.Take(12).Max());
        Assert.All(bars.Skip(1).Take(10), b => Assert.InRange(b, 235, 255));
        // Un quart de l'amplitude : un quart de l'énergie de la barre la plus forte.
        Assert.All(bars.Skip(13).Take(10), b => Assert.InRange(b, 50, 80));
        // Silence puis, après la fin du son (6 s), le plancher.
        Assert.All(bars.Skip(25).Take(10), b => Assert.InRange(b, 0, 6));
        Assert.All(bars.Skip(40), b => Assert.Equal(0, b));
    }

    [Fact]
    public void LesBasses_ToucheLaBasse_PasLAigu()
    {
        var envelope = Analyze().Envelope;

        // 60 valeurs par seconde : la basse occupe les 120 premières, l'aigu les 120 suivantes.
        Assert.All(envelope.Skip(10).Take(100), v => Assert.InRange(v, 200, 255));
        Assert.All(envelope.Skip(130).Take(100), v => Assert.InRange(v, 0, 30));
        Assert.All(envelope.Skip(250).Take(100), v => Assert.InRange(v, 0, 5));
    }

    [Fact]
    public void UnSonMuet_DonneDesZeros_PasUneDivisionParZero()
    {
        // Un MP3 de silence : ni barres ni basses, et aucune exception.
        using var stream = new MemoryStream(Silence());
        var data = WaveformFormat.Parse(WaveformAnalyzer.Analyze(stream))!;

        Assert.All(data.Bars, b => Assert.Equal(0, b));
        Assert.All(data.Envelope, v => Assert.Equal(0, v));
    }

    [Fact]
    public void UnFluxIllisible_LeveInvalidDataException()
    {
        using var garbage = new MemoryStream(new byte[2048]);
        Assert.Throws<InvalidDataException>(() => WaveformAnalyzer.Analyze(garbage));

        using var empty = new MemoryStream();
        Assert.Throws<InvalidDataException>(() => WaveformAnalyzer.Analyze(empty));
    }

    [Fact]
    public void Parse_RefuseUnBlobAbimeOuDUneAutreVersion()
    {
        using var stream = new MemoryStream(Synthetic());
        var blob = WaveformAnalyzer.Analyze(stream);

        Assert.NotNull(WaveformFormat.Parse(blob));
        Assert.Null(WaveformFormat.Parse(blob[..^1]));
        Assert.Null(WaveformFormat.Parse(null));
        Assert.Null(WaveformFormat.Parse([]));

        var other = (byte[])blob.Clone();
        other[0] = (byte)(WaveformFormat.CurrentVersion + 1);
        Assert.Null(WaveformFormat.Parse(other));
        Assert.False(WaveformFormat.IsCurrent(other));
    }

    // Un MP3 de 2 s de silence.
    private static byte[] Silence()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", "silence.mp3");
        return File.ReadAllBytes(path);
    }
}
