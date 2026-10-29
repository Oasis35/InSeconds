/**
 * La forme d'un extrait, calculée dans le navigateur à partir du son décodé : les barres de la waveform du lecteur et l'énergie des
 * basses qui fait bouger le bouton. Rien n'est stocké (piège 47) : le calcul est refait à chaque morceau, en mémoire.
 */
export interface Waveform {
  /** Une valeur de 0 à 1 par barre, de 0 au dernier palier (échelle proportionnelle au temps). */
  readonly peaks: readonly number[];
  /** L'énergie des basses, de 0 à 1, `ENVELOPE_FPS` valeurs par seconde, sur tout l'extrait. */
  readonly envelope: readonly number[];
}

/** Le nombre de barres de la waveform. */
export const WAVEFORM_BARS = 32;

/** Valeurs de l'enveloppe des basses par seconde : une par image. */
export const ENVELOPE_FPS = 60;

/** Fréquence de coupure du filtre passe-bas qui garde les basses (grosse caisse, basse). */
const BASS_CUTOFF_HZ = 150;

/** Une barre ne descend jamais sous cette hauteur : un silence reste visible. */
const MIN_PEAK = 0.12;

/**
 * Les barres de la waveform : l'énergie (RMS) de chaque tranche de `seconds / bars` secondes, rapportée à la plus forte. Les tranches
 * au-delà de la fin du son valent le minimum.
 */
export function wavePeaks(samples: Float32Array, sampleRate: number, seconds: number, bars = WAVEFORM_BARS): number[] {
  const slice = Math.max(1, Math.floor((seconds * sampleRate) / bars));
  const raw: number[] = [];
  for (let b = 0; b < bars; b++) {
    const start = b * slice;
    const end = Math.min(start + slice, samples.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    raw.push(end > start ? Math.sqrt(sum / (end - start)) : 0);
  }
  const max = Math.max(...raw);
  return raw.map(v => (max > 0 ? MIN_PEAK + (1 - MIN_PEAK) * (v / max) : MIN_PEAK));
}

/**
 * L'énergie des basses, image par image : un passe-bas à un pôle garde ce qui est sous 150 Hz, puis l'énergie de chaque image est
 * rapportée à la plus forte. Elle monte d'un coup et redescend doucement, comme une membrane de haut-parleur.
 */
export function bassEnvelope(samples: Float32Array, sampleRate: number, fps = ENVELOPE_FPS): number[] {
  const hop = Math.max(1, Math.round(sampleRate / fps));
  const alpha = 1 - Math.exp((-2 * Math.PI * BASS_CUTOFF_HZ) / sampleRate);
  const raw: number[] = [];
  let low = 0;
  for (let i = 0; i < samples.length; i += hop) {
    let sum = 0;
    const end = Math.min(i + hop, samples.length);
    for (let j = i; j < end; j++) {
      low += alpha * (samples[j] - low);
      sum += low * low;
    }
    raw.push(Math.sqrt(sum / hop));
  }
  const max = Math.max(0, ...raw);
  let smooth = 0;
  return raw.map(v => {
    const x = max > 0 ? v / max : 0;
    smooth = x > smooth ? x : smooth * 0.82 + x * 0.18;
    return smooth;
  });
}

/** L'énergie des basses à la position `seconds` de l'extrait (0 hors de l'enveloppe). */
export function bassAt(envelope: readonly number[], seconds: number, fps = ENVELOPE_FPS): number {
  if (envelope.length === 0 || seconds < 0) return 0;
  return envelope[Math.min(envelope.length - 1, Math.floor(seconds * fps))] ?? 0;
}
