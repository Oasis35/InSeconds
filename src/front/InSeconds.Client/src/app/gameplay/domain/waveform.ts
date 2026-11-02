/**
 * La forme d'un extrait : les barres de la waveform du lecteur et l'énergie des basses qui fait bouger le bouton. Elle vient de l'API
 * (`waveformFromBlob`, calculée la nuit sur le catalogue) ou, à défaut, du son décodé dans le navigateur (`wavePeaks`, `bassEnvelope`).
 */
export interface Waveform {
  /** Une valeur de 0 à 1 par barre, de 0 au dernier palier (échelle proportionnelle au temps). */
  readonly peaks: readonly number[];
  /** L'énergie des basses, de 0 à 1, `ENVELOPE_FPS` valeurs par seconde, sur tout l'extrait. */
  readonly envelope: readonly number[];
}

/**
 * Le nombre de barres de la waveform : une barre = 1/6 s sur 10 s, donc chaque palier tombe entre deux barres (0,5 s = 3 barres,
 * 1 s = 6, 5 s = 30).
 */
export const WAVEFORM_BARS = 60;

/** Valeurs de l'enveloppe des basses par seconde : une par image. */
export const ENVELOPE_FPS = 60;

/** Fréquence de coupure du filtre passe-bas qui garde les basses (grosse caisse, basse). */
const BASS_CUTOFF_HZ = 150;

/** Une barre ne descend jamais sous cette hauteur : un silence reste visible. */
const MIN_PEAK = 0.08;

/** La barre de référence (hauteur pleine) : le 95e centile, pas la plus forte, pour qu'un seul pic n'écrase pas tout le reste. */
const REFERENCE_PERCENTILE = 0.95;

/** Courbe de contraste : un peu plus de relief entre les passages calmes et les passages forts. */
const CONTRAST_EXPONENT = 1.2;

/**
 * Les barres de la waveform : l'énergie (RMS) de chaque tranche de `seconds / bars` secondes, rapportée au 95e centile (écrêtée à 1),
 * passée par une courbe de contraste, avec un plancher. Les tranches au-delà de la fin du son valent le plancher.
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
  return shapePeaks(raw);
}

/** Rapporte des énergies brutes au 95e centile, passe la courbe de contraste, applique le plancher. */
function shapePeaks(raw: readonly number[]): number[] {
  const sorted = [...raw].sort((a, b) => a - b);
  const reference = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * REFERENCE_PERCENTILE))] ?? 0;
  return raw.map(v => {
    const x = reference > 0 ? Math.min(1, v / reference) : 0;
    return MIN_PEAK + (1 - MIN_PEAK) * Math.pow(x, CONTRAST_EXPONENT);
  });
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
  return smoothEnvelope(raw.map(v => (max > 0 ? v / max : 0)));
}

/** Monte d'un coup, redescend doucement : l'allure d'une membrane de haut-parleur. */
function smoothEnvelope(values: readonly number[]): number[] {
  let smooth = 0;
  return values.map(x => {
    smooth = x > smooth ? x : smooth * 0.82 + x * 0.18;
    return smooth;
  });
}

/** L'énergie des basses à la position `seconds` de l'extrait (0 hors de l'enveloppe). */
export function bassAt(envelope: readonly number[], seconds: number, fps = ENVELOPE_FPS): number {
  if (envelope.length === 0 || seconds < 0) return 0;
  return envelope[Math.min(envelope.length - 1, Math.floor(seconds * fps))] ?? 0;
}

/** La version du format du blob de l'API (`WaveformFormat.CurrentVersion` côté back) : un autre numéro est ignoré, le navigateur calcule. */
const BLOB_VERSION = 1;
const BLOB_HEADER_BYTES = 4;

/**
 * La forme envoyée par l'API (blob en base64) : un en-tête de 4 octets (version, secondes, barres par seconde, valeurs d'enveloppe par
 * seconde), les barres (RMS, une par 1/6 s) puis l'enveloppe des basses, chaque valeur de 0 à 255 rapportée au plus fort de tout
 * l'extrait. Rend la même `Waveform` que le calcul du navigateur sur les `seconds` premières secondes (le dernier palier), ou `null` si le
 * blob est absent, d'une autre version ou abîmé : l'appelant calcule alors dans le navigateur.
 */
export function waveformFromBlob(base64: string | null | undefined, seconds: number): Waveform | null {
  if (!base64 || seconds <= 0) return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), c => c.codePointAt(0) ?? 0);
  } catch {
    return null;
  }
  if (bytes.length < BLOB_HEADER_BYTES || bytes[0] !== BLOB_VERSION) return null;
  const [, blobSeconds, barsPerSecond, envelopePerSecond] = bytes;
  const barCount = blobSeconds * barsPerSecond;
  const envelopeCount = blobSeconds * envelopePerSecond;
  if (barCount === 0 || envelopeCount === 0 || bytes.length !== BLOB_HEADER_BYTES + barCount + envelopeCount) return null;

  const bars = bytes.subarray(BLOB_HEADER_BYTES, BLOB_HEADER_BYTES + barCount);
  const envelope = bytes.subarray(BLOB_HEADER_BYTES + barCount);

  // Une barre du lecteur = seconds / 60 s : on prend la moyenne des barres du serveur qu'elle recouvre (au moins une).
  const window = Math.min(seconds, blobSeconds);
  const raw: number[] = [];
  for (let b = 0; b < WAVEFORM_BARS; b++) {
    const from = Math.min(barCount - 1, Math.floor(((b * window) / WAVEFORM_BARS) * barsPerSecond));
    const to = Math.max(from + 1, Math.min(barCount, Math.ceil((((b + 1) * window) / WAVEFORM_BARS) * barsPerSecond)));
    let sum = 0;
    for (let i = from; i < to; i++) sum += bars[i];
    raw.push(sum / (to - from) / 255);
  }

  return { peaks: shapePeaks(raw), envelope: smoothEnvelope(resampleEnvelope(envelope, envelopePerSecond)) };
}

/** L'enveloppe du serveur ramenée à `ENVELOPE_FPS` valeurs par seconde (identique quand le serveur en donne autant). */
function resampleEnvelope(envelope: Uint8Array, perSecond: number): number[] {
  if (perSecond === ENVELOPE_FPS) return Array.from(envelope, v => v / 255);
  const count = Math.floor((envelope.length / perSecond) * ENVELOPE_FPS);
  return Array.from({ length: count }, (_, i) => envelope[Math.min(envelope.length - 1, Math.floor((i / ENVELOPE_FPS) * perSecond))] / 255);
}
