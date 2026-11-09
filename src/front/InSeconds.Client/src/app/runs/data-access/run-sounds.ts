import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { StoragePort } from '../../core/storage/storage.port';
import { AudioPort } from '../../gameplay/data-access/audio.port';

/** Un son d'interface : une suite de notes brèves, synthétisées. */
interface Note {
  /** Fréquence, en hertz. */
  readonly hz: number;
  /** Départ après le début du son, en secondes. */
  readonly at: number;
  /** Durée, en secondes. */
  readonly seconds: number;
  readonly type: OscillatorType;
  readonly gain: number;
}

/** Les sons d'interface du mode Platines, tous synthétisés ici (Web Audio, aucun fichier, aucun droit à céder). */
export type RunSound = 'tick' | 'roundPassed' | 'cardTaken' | 'won' | 'lost';

/** Une famille de sons doux (triangle et sinusoïde, aucune onde carrée), brefs, sous le niveau d'un extrait, en do majeur. */
const SOUNDS: Readonly<Record<RunSound, readonly Note[]>> = {
  // Le tic des dernières secondes du chrono : bref et sec, en triangle (sans les harmoniques aiguës qui sifflent sur un haut-parleur de téléphone).
  tick: [{ hz: 880, at: 0, seconds: 0.045, type: 'triangle', gain: 0.14 }],
  // Une manche passée : deux notes qui montent (quinte), douces.
  roundPassed: [
    { hz: 523.25, at: 0, seconds: 0.12, type: 'triangle', gain: 0.18 },
    { hz: 783.99, at: 0.1, seconds: 0.22, type: 'triangle', gain: 0.18 },
  ],
  // Une carte prise au palier : un petit déclic.
  cardTaken: [{ hz: 659.25, at: 0, seconds: 0.06, type: 'sine', gain: 0.14 }],
  // Le run gagné : un accord arpégé qui monte.
  won: [
    { hz: 523.25, at: 0, seconds: 0.14, type: 'triangle', gain: 0.18 },
    { hz: 783.99, at: 0.12, seconds: 0.14, type: 'triangle', gain: 0.18 },
    { hz: 1046.5, at: 0.24, seconds: 0.32, type: 'triangle', gain: 0.18 },
  ],
  // Le run perdu : deux notes qui descendent, sans dramatiser.
  lost: [
    { hz: 392, at: 0, seconds: 0.16, type: 'triangle', gain: 0.16 },
    { hz: 293.66, at: 0.14, seconds: 0.3, type: 'triangle', gain: 0.16 },
  ],
};

/** La préférence du joueur, gardée dans ce navigateur seulement (rien n'est envoyé). */
export const SOUNDS_MUTED_KEY = 'runs.sounds.muted';

/**
 * Les sons d'interface du mode Platines (le tic du chrono, une manche passée, une carte prise, la fin du run), synthétisés : aucun fichier, des
 * sons à nous. Ils ne sonnent **jamais pendant un extrait** : le service lit lui-même l'état du lecteur (`AudioPort`), aucun appelant n'a à y
 * penser. Le joueur peut les couper (`toggleMuted`, retenu dans ce navigateur). Le contexte audio se crée et se réveille dans un clic du joueur
 * (`unlock`, iPhone : un contexte créé hors d'un geste reste muet, et Safari l'interrompt après un appel ou un passage par une autre appli) ;
 * sans Web Audio, ou si le navigateur le refuse, rien ne sonne. Sur iPhone, Web Audio suit l'interrupteur silencieux, l'extrait non.
 */
@Injectable()
export class RunSounds {
  private readonly audio = inject(AudioPort);
  private readonly storage = inject(StoragePort);
  private context: AudioContext | null = null;
  private readonly _muted = signal(this.storage.get(SOUNDS_MUTED_KEY) === '1');
  readonly muted = this._muted.asReadonly();

  constructor() {
    // Safari limite le nombre de contextes audio : celui de la page se ferme avec elle.
    inject(DestroyRef).onDestroy(() => void this.context?.close().catch(() => undefined));
  }

  /** À appeler dans le clic du joueur, avant tout `await`. */
  unlock(): void {
    try {
      if (!this.context && typeof AudioContext === 'function') this.context = new AudioContext();
      // `suspended`, ou `interrupted` de Safari (absent des types) : tout ce qui n'est ni en marche ni fermé se relance.
      const state = this.context?.state as string | undefined;
      if (this.context && state !== 'running' && state !== 'closed') void this.context.resume().catch(() => undefined);
    } catch {
      this.context = null;
    }
  }

  toggleMuted(): void {
    const muted = !this._muted();
    this._muted.set(muted);
    if (muted) this.storage.set(SOUNDS_MUTED_KEY, '1');
    else this.storage.remove(SOUNDS_MUTED_KEY);
  }

  /** Joue un son, sauf sons coupés, contexte muet ou extrait en cours de lecture. */
  play(sound: RunSound): void {
    const context = this.context;
    if (this._muted() || this.audio.state() === 'playing' || context?.state !== 'running') return;
    try {
      const start = context.currentTime;
      for (const note of SOUNDS[sound]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const at = start + note.at;
        oscillator.type = note.type;
        oscillator.frequency.value = note.hz;
        gain.gain.setValueAtTime(note.gain, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + note.seconds);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + note.seconds);
      }
    } catch {
      // un son manqué ne gêne pas la partie
    }
  }
}
