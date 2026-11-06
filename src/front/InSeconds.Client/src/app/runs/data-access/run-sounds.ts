import { DestroyRef, Injectable, inject, signal } from '@angular/core';

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

const SOUNDS: Readonly<Record<RunSound, readonly Note[]>> = {
  // Le tic des dernières secondes du chrono : un clic bref et sec, assez bas pour ne pas siffler sur un haut-parleur de téléphone.
  tick: [{ hz: 880, at: 0, seconds: 0.05, type: 'square', gain: 0.12 }],
  // Une manche passée : deux notes qui montent (quinte), douces.
  roundPassed: [
    { hz: 523.25, at: 0, seconds: 0.12, type: 'triangle', gain: 0.18 },
    { hz: 783.99, at: 0.1, seconds: 0.22, type: 'triangle', gain: 0.18 },
  ],
  // Une carte prise ou jouée : un petit déclic aigu.
  cardTaken: [{ hz: 1318.5, at: 0, seconds: 0.06, type: 'sine', gain: 0.14 }],
  // Le run gagné : un accord arpégé qui monte.
  won: [
    { hz: 523.25, at: 0, seconds: 0.14, type: 'triangle', gain: 0.18 },
    { hz: 659.25, at: 0.11, seconds: 0.14, type: 'triangle', gain: 0.18 },
    { hz: 783.99, at: 0.22, seconds: 0.14, type: 'triangle', gain: 0.18 },
    { hz: 1046.5, at: 0.33, seconds: 0.32, type: 'triangle', gain: 0.18 },
  ],
  // Le run perdu : deux notes qui descendent, sans dramatiser.
  lost: [
    { hz: 392, at: 0, seconds: 0.16, type: 'triangle', gain: 0.16 },
    { hz: 293.66, at: 0.14, seconds: 0.3, type: 'triangle', gain: 0.16 },
  ],
};

/** La préférence du joueur, gardée dans ce navigateur seulement. */
const MUTED_KEY = 'runs.sounds.muted';

/**
 * Les sons d'interface du mode Platines (le tic du chrono, une manche passée, une carte prise, la fin du run), synthétisés : aucun fichier, des
 * sons à nous. Ils ne sonnent **jamais pendant un extrait** : celui qui les déclenche le vérifie (`play(sound, extractPlaying)`). Le joueur peut
 * les couper (`toggleMuted`, retenu dans ce navigateur). Le contexte audio se crée et se réveille dans un clic du joueur (`unlock`, iPhone : un
 * contexte créé hors d'un geste reste muet) ; sans Web Audio, ou si le navigateur le refuse, rien ne sonne.
 */
@Injectable()
export class RunSounds {
  private context: AudioContext | null = null;
  private readonly _muted = signal(readMuted());
  readonly muted = this._muted.asReadonly();

  constructor() {
    // Safari limite le nombre de contextes audio : celui de la page se ferme avec elle.
    inject(DestroyRef).onDestroy(() => void this.context?.close().catch(() => undefined));
  }

  /** À appeler dans le clic du joueur, avant tout `await`. */
  unlock(): void {
    try {
      if (!this.context && typeof AudioContext === 'function') this.context = new AudioContext();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch {
      this.context = null;
    }
  }

  toggleMuted(): void {
    const muted = !this._muted();
    this._muted.set(muted);
    try {
      if (muted) localStorage.setItem(MUTED_KEY, '1');
      else localStorage.removeItem(MUTED_KEY);
    } catch {
      // stockage refusé (navigation privée) : la préférence vaut pour la visite
    }
  }

  /** Joue un son, sauf sons coupés, contexte muet ou extrait en cours de lecture. */
  play(sound: RunSound, extractPlaying = false): void {
    const context = this.context;
    if (this._muted() || extractPlaying || context?.state !== 'running') return;
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

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}
