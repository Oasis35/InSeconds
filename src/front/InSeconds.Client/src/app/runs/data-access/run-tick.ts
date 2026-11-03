import { DestroyRef, Injectable, inject } from '@angular/core';

/** Le tic : un clic bref et sec, assez bas pour ne pas siffler sur un haut-parleur de téléphone. */
const TICK_HZ = 880;
const TICK_SECONDS = 0.05;
const TICK_GAIN = 0.12;

/**
 * Le tic des dernières secondes du chrono, synthétisé (Web Audio, aucun fichier). Le contexte audio se crée et se réveille dans un clic du
 * joueur (`unlock`, iPhone : un contexte créé hors d'un geste reste muet) ; sans Web Audio, ou si le navigateur le refuse, rien ne sonne.
 */
@Injectable()
export class RunTick {
  private context: AudioContext | null = null;

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

  play(): void {
    const context = this.context;
    if (context?.state !== 'running') return;
    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = TICK_HZ;
      gain.gain.setValueAtTime(TICK_GAIN, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + TICK_SECONDS);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + TICK_SECONDS);
    } catch {
      // un tic manqué ne gêne pas la partie
    }
  }
}
