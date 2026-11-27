import { Injectable } from '@angular/core';

/** Les bruitages du jeu : un son court par moment fort, jamais une information que l'écran ne dit pas déjà. */
export type SoundName = 'correct' | 'partial' | 'wrong' | 'finish';

/** Volume de chaque son (0 à 1) : bas, pour passer par-dessus l'extrait sans le couvrir. */
export const SOUND_VOLUME: Readonly<Record<SoundName, number>> = { correct: 0.5, partial: 0.4, wrong: 0.4, finish: 0.5 };

/** Adresse de chaque fichier (`public/sounds`, mis en cache par le service worker). */
export const SOUND_FILES: Readonly<Record<SoundName, string>> = {
  correct: '/sounds/correct.mp3',
  partial: '/sounds/partial.mp3',
  wrong: '/sounds/wrong.mp3',
  finish: '/sounds/finish.mp3',
};

/**
 * Joue les bruitages (port transverse, remplacé par un faux dans les tests). Ne lève jamais : sans son, le jeu continue.
 * `unlock()` s'appelle dans le gestionnaire d'un clic, avant tout `await` (iPhone : le contexte audio ne démarre que dans un geste).
 */
// Fabrique paresseuse : WebAudioSoundPort est déclarée plus bas dans le fichier.
@Injectable({ providedIn: 'root', useFactory: () => new WebAudioSoundPort() })
export abstract class SoundPort {
  abstract unlock(): void;
  abstract play(name: SoundName): void;
}

/** Web Audio : les quatre fichiers sont décodés une fois, au déverrouillage, puis rejoués sans réseau. */
export class WebAudioSoundPort extends SoundPort {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private loading = false;

  unlock(): void {
    try {
      this.context ??= typeof AudioContext === 'function' ? new AudioContext() : null;
      void this.context?.resume().catch(() => undefined);
      this.load();
    } catch {
      // pas de Web Audio : le jeu reste muet
    }
  }

  play(name: SoundName): void {
    const context = this.context;
    if (!context || !this.buffers.has(name)) return;
    if (context.state === 'running') {
      this.start(context, name);
      return;
    }
    // Contexte suspendu (iPhone : appel, retour d'arrière-plan) : on tente de le relancer, le son part s'il y arrive.
    void context.resume().then(() => this.start(context, name)).catch(() => undefined);
  }

  private start(context: AudioContext, name: SoundName): void {
    const buffer = this.buffers.get(name);
    if (!buffer || context.state !== 'running') return;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = SOUND_VOLUME[name];
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      source.start();
    } catch {
      // un son perdu ne gêne pas la partie
    }
  }

  /** Charge les fichiers qui manquent encore ; un échec se retente au déverrouillage suivant, sans refaire ceux qui ont réussi. */
  private load(): void {
    const context = this.context;
    if (this.loading || !context) return;
    const missing = (Object.keys(SOUND_FILES) as SoundName[]).filter(name => !this.buffers.has(name));
    if (missing.length === 0) return;
    this.loading = true;
    const loads = missing.map(name =>
      fetch(SOUND_FILES[name])
        .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error('sound'))))
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => {
          this.buffers.set(name, buffer);
        }),
    );
    void Promise.allSettled(loads).then(() => {
      this.loading = false;
    });
  }
}

/** Faux pour les tests : garde les sons demandés. */
export class FakeSoundPort extends SoundPort {
  readonly played: SoundName[] = [];
  unlocks = 0;

  unlock(): void {
    this.unlocks++;
  }

  play(name: SoundName): void {
    this.played.push(name);
  }
}
