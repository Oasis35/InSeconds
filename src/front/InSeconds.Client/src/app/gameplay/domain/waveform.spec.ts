import { ENVELOPE_FPS, bassAt, bassEnvelope, wavePeaks } from './waveform';

/** `seconds` secondes d'une sinusoïde de `hz` Hz, d'amplitude `amplitude`. */
function tone(seconds: number, hz: number, amplitude = 1, sampleRate = 8000): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate));
}

describe('wavePeaks', () => {
  it('rend une barre par tranche, la plus forte à 1', () => {
    const samples = new Float32Array([...tone(1, 100, 0.2), ...tone(1, 100, 1)]);
    const peaks = wavePeaks(samples, 8000, 2, 4);
    expect(peaks).toHaveLength(4);
    expect(peaks[3]).toBeCloseTo(1);
    expect(peaks[0]).toBeLessThan(peaks[3]);
  });

  it('garde une hauteur minimale au silence et après la fin du son', () => {
    const peaks = wavePeaks(tone(1, 100), 8000, 2, 4);
    expect(peaks[3]).toBeGreaterThan(0);
    expect(peaks[3]).toBeLessThan(0.2);
  });
});

describe('bassEnvelope', () => {
  it('suit les basses et laisse passer peu des aigus', () => {
    const samples = new Float32Array([...tone(0.5, 60), ...tone(0.5, 3000)]);
    const envelope = bassEnvelope(samples, 8000);
    expect(envelope.length).toBe(Math.ceil(samples.length / Math.round(8000 / ENVELOPE_FPS)));
    expect(Math.max(...envelope.slice(0, 25))).toBeCloseTo(1, 1);
    // Les aigus arrivent quand la basse s'éteint : l'enveloppe redescend.
    expect(envelope.at(-1)!).toBeLessThan(0.3);
  });

  it('reste à 0 sur un silence', () => {
    expect(bassEnvelope(new Float32Array(800), 8000).every(v => v === 0)).toBe(true);
  });
});

describe('bassAt', () => {
  it('lit l\'image de la position, 0 hors de l\'enveloppe', () => {
    const envelope = [0, 0.5, 1];
    expect(bassAt(envelope, 1 / ENVELOPE_FPS)).toBe(0.5);
    expect(bassAt(envelope, 10)).toBe(1);
    expect(bassAt([], 1)).toBe(0);
    expect(bassAt(envelope, -1)).toBe(0);
  });
});
