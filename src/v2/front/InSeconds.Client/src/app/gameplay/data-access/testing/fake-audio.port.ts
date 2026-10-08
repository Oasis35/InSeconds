import { Provider, signal } from '@angular/core';
import { AudioStatus } from '../../domain/track-round';
import { AudioPort } from '../audio.port';

/**
 * Un faux lecteur pour tester la manche sans son : il note ce qu'on lui demande (`calls`) et c'est
 * le test qui décide de ses états (`emit`), comme le ferait un vrai lecteur.
 */
export class FakeAudioPort extends AudioPort {
  private readonly _state = signal<AudioStatus>('idle');
  readonly state = this._state.asReadonly();
  private readonly _position = signal(0);
  readonly position = this._position.asReadonly();
  readonly calls: string[] = [];

  /** Ce que le lecteur annoncerait (chargé, en lecture, fini, en erreur…). */
  emit(state: AudioStatus, position = this._position()): void {
    this._position.set(position);
    this._state.set(state);
  }

  load(url: string, nextUrl?: string | null): void {
    this.calls.push(nextUrl ? `load ${url} next ${nextUrl}` : `load ${url}`);
    this._state.set('loading');
  }

  playUntil(seconds: number): void {
    this.calls.push(`playUntil ${seconds}`);
  }

  replay(seconds: number): void {
    this.calls.push(`replay ${seconds}`);
  }

  playFull(): void {
    this.calls.push('playFull');
  }

  unlock(): void {
    this.calls.push('unlock');
  }

  stop(): void {
    this.calls.push('stop');
    this._position.set(0);
    this._state.set('idle');
  }
}

export function provideFakeAudio(audio: FakeAudioPort): Provider {
  return { provide: AudioPort, useValue: audio };
}
