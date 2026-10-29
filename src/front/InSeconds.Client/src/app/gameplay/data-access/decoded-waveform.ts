import { Injectable } from '@angular/core';
import { Waveform, bassEnvelope, wavePeaks } from '../domain/waveform';
import { WaveformPort } from './waveform.port';

/** Fréquence d'échantillonnage du décodage : assez pour les basses et la forme, deux fois moins de calcul qu'à 44,1 kHz. */
const DECODE_SAMPLE_RATE = 22_050;

/**
 * Le `WaveformPort` sur le son décodé : l'extrait est relu (`fetch`, le CDN de Deezer répond en CORS) puis décodé par un
 * `OfflineAudioContext`, qui ne joue rien et ne touche pas à la session audio de l'iPhone. Jamais d'`AnalyserNode` branché sur la
 * lecture (pièges 44 et 46 : la lecture reste à l'élément audio seul).
 *
 * Rien n'est gardé (piège 47) : `cache: 'no-store'`, et le son décodé est oublié dès le calcul fini. Un échec (réseau, signature expirée,
 * navigateur sans Web Audio, décodage refusé) rend `null` sans rien remonter : le lecteur garde ses barres plates, la partie continue.
 */
@Injectable()
export class DecodedWaveform extends WaveformPort {
  async load(url: string, seconds: number): Promise<Waveform | null> {
    try {
      const Offline = globalThis.OfflineAudioContext;
      if (!Offline) return null;
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      const decoded = await new Offline(1, 1, DECODE_SAMPLE_RATE).decodeAudioData(bytes);
      const samples = decoded.getChannelData(0);
      return { peaks: wavePeaks(samples, decoded.sampleRate, seconds), envelope: bassEnvelope(samples, decoded.sampleRate) };
    } catch {
      // Waveform de confort : son absence ne gêne pas la partie, elle n'est pas une panne à remonter.
      return null;
    }
  }
}
