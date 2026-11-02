namespace InSeconds.Waveform;

/// <summary>
/// Le blob d'une forme d'extrait, tel qu'il est stocké en base et envoyé au navigateur (en base64). Cinq nombres d'en-tête puis deux tableaux
/// d'octets :
/// <code>
/// [0] version du format   [1] secondes couvertes   [2] barres par seconde   [3] valeurs de basses par seconde
/// [4 …] barres (secondes × barres par seconde)     [… fin] basses (secondes × valeurs par seconde)
/// </code>
/// Les valeurs sont des octets de 0 à 255, rapportés à la plus forte du tableau (l'échelle de la fenêtre affichée est refaite par le
/// navigateur). Une version qui change le calcul ou la disposition se reconnaît à l'octet 0 : le contrôle nocturne recalcule les anciennes.
/// </summary>
public static class WaveformFormat
{
    /// <summary>La version que ce code écrit. À augmenter quand le calcul ou la disposition changent : les anciens blobs sont refaits.</summary>
    public const byte CurrentVersion = 1;

    /// <summary>Secondes de l'extrait couvertes : tout l'extrait de Deezer (30 s). Le navigateur n'en affiche que la fenêtre du dernier palier.</summary>
    public const int Seconds = 30;

    /// <summary>Une barre = 1/6 s : sur 10 s, les 60 barres du lecteur, et chaque palier tombe entre deux barres.</summary>
    public const int BarsPerSecond = 6;

    /// <summary>Valeurs de l'énergie des basses par seconde : une par image à 60 Hz.</summary>
    public const int EnvelopePerSecond = 60;

    /// <summary>Taille de l'en-tête, en octets.</summary>
    public const int HeaderLength = 4;

    /// <summary>La version écrite dans ce blob, ou <c>null</c> s'il est vide ou trop court pour en avoir une.</summary>
    public static byte? VersionOf(byte[]? blob) => blob is { Length: >= HeaderLength } ? blob[0] : null;

    /// <summary>Ce blob est celui que ce code écrirait aujourd'hui (même version).</summary>
    public static bool IsCurrent(byte[]? blob) => VersionOf(blob) == CurrentVersion;

    /// <summary>
    /// Relit un blob de la version courante. <c>null</c> si l'en-tête ou la longueur ne correspondent pas : un blob abîmé ou d'une autre
    /// version n'est jamais envoyé tel quel.
    /// </summary>
    public static WaveformData? Parse(byte[]? blob)
    {
        if (blob is null || !IsCurrent(blob))
            return null;

        int seconds = blob[1], barsPerSecond = blob[2], envelopePerSecond = blob[3];
        var bars = seconds * barsPerSecond;
        var envelope = seconds * envelopePerSecond;
        if (seconds == 0 || barsPerSecond == 0 || envelopePerSecond == 0 || blob.Length != HeaderLength + bars + envelope)
            return null;

        return new WaveformData(
            seconds, barsPerSecond, envelopePerSecond,
            blob.AsMemory(HeaderLength, bars).ToArray(),
            blob.AsMemory(HeaderLength + bars, envelope).ToArray());
    }

    internal static byte[] Write(WaveformData data)
    {
        var blob = new byte[HeaderLength + data.Bars.Length + data.Envelope.Length];
        blob[0] = CurrentVersion;
        blob[1] = (byte)data.Seconds;
        blob[2] = (byte)data.BarsPerSecond;
        blob[3] = (byte)data.EnvelopePerSecond;
        data.Bars.CopyTo(blob, HeaderLength);
        data.Envelope.CopyTo(blob, HeaderLength + data.Bars.Length);
        return blob;
    }
}

/// <summary>Une forme relue : les barres (énergie de chaque tranche de 1/6 s) et l'énergie des basses (une valeur par image à 60 Hz).</summary>
public sealed record WaveformData(int Seconds, int BarsPerSecond, int EnvelopePerSecond, byte[] Bars, byte[] Envelope);
