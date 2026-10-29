import { Provider } from '@angular/core';
import { Waveform } from '../../domain/waveform';
import { WaveformPort } from '../waveform.port';

/** Une fausse forme d'extrait : le test décide quand elle arrive (`resolve`), et ce qu'elle vaut. */
export class FakeWaveformPort extends WaveformPort {
  readonly calls: string[] = [];
  private readonly pending: ((waveform: Waveform | null) => void)[] = [];

  load(url: string, seconds: number): Promise<Waveform | null> {
    this.calls.push(`load ${url} ${seconds}`);
    return new Promise(resolve => this.pending.push(resolve));
  }

  /** Rend la forme à la plus ancienne demande en attente. */
  async resolve(waveform: Waveform | null): Promise<void> {
    this.pending.shift()?.(waveform);
    await Promise.resolve();
  }
}

export function provideFakeWaveform(waveforms: FakeWaveformPort): Provider {
  return { provide: WaveformPort, useValue: waveforms };
}
