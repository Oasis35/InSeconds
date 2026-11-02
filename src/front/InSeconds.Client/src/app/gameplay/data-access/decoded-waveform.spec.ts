import { WAVEFORM_BARS } from '../domain/waveform';
import { DecodedWaveform } from './decoded-waveform';
import { makeToneUrl } from './testing/wav';

describe('DecodedWaveform', () => {
  it('décode l\'extrait et en rend les barres et les basses', async () => {
    const waveform = await new DecodedWaveform().load(makeToneUrl(2), 1);
    expect(waveform).not.toBeNull();
    expect(waveform!.peaks).toHaveLength(WAVEFORM_BARS);
    expect(Math.max(...waveform!.peaks)).toBeCloseTo(1);
    // Tout l'extrait (2 s), pas seulement le dernier palier : la pochette danse encore après la révélation.
    expect(waveform!.envelope.length).toBeGreaterThan(100);
  });

  it('rend `null` sans exception quand l\'extrait est illisible', async () => {
    const bad = URL.createObjectURL(new Blob(['pas du son'], { type: 'audio/mpeg' }));
    await expect(new DecodedWaveform().load(bad, 10)).resolves.toBeNull();
  });
});
