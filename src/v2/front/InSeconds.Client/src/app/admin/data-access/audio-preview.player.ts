import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';

/** Ce que le lecteur utilise d'un élément audio (remplaçable en test). */
export interface PreviewAudio {
  paused: boolean;
  currentTime: number;
  duration: number;
  onended: ((event: Event) => unknown) | null;
  play(): Promise<void>;
  pause(): void;
}

export const PREVIEW_AUDIO_FACTORY = new InjectionToken<(url: string) => PreviewAudio>('PREVIEW_AUDIO_FACTORY', {
  factory: () => (url: string) => new Audio(url),
});

/**
 * Le lecteur des extraits de 30 s de l'admin (écoute d'un résultat de recherche, d'une ligne du
 * pool) : un seul son à la fois. Écouter un autre extrait coupe le premier ; `stop()` libère tout.
 * Ne garde rien d'un extrait en dehors de la lecture (aucun stockage d'audio, piège 47).
 */
@Injectable()
export class AudioPreviewPlayer {
  private readonly createAudio = inject(PREVIEW_AUDIO_FACTORY);
  private audio: PreviewAudio | null = null;
  private frame: number | null = null;
  /** Incrémenté à chaque changement : une promesse de lecture périmée n'écrit plus rien. */
  private generation = 0;

  private readonly _url = signal<string | null>(null);
  /** L'extrait chargé (en lecture ou en pause), `null` si aucun. */
  readonly url = this._url.asReadonly();
  private readonly _playing = signal(false);
  readonly playing = this._playing.asReadonly();
  /** Avancement de la lecture, de 0 à 100. */
  private readonly _progress = signal(0);
  readonly progress = this._progress.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Joue `url`, ou met en pause si c'est l'extrait en cours de lecture. Sans effet sans adresse. */
  toggle(url: string | null | undefined): void {
    if (!url) return;
    if (this.audio && this._url() === url) {
      if (this._playing()) this.pause();
      else this.play(this.audio);
      return;
    }

    this.stop();
    const audio = this.createAudio(url);
    audio.onended = () => {
      this.cancelFrame();
      this._playing.set(false);
      this._progress.set(100);
    };
    this.audio = audio;
    this._url.set(url);
    this.play(audio);
  }

  /** Coupe la lecture et libère l'extrait. */
  stop(): void {
    this.generation++;
    this.cancelFrame();
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio = null;
    }
    this._url.set(null);
    this._playing.set(false);
    this._progress.set(0);
  }

  private pause(): void {
    this.audio?.pause();
    this.cancelFrame();
    this._playing.set(false);
  }

  private play(audio: PreviewAudio): void {
    const generation = ++this.generation;
    audio.play().then(
      () => {
        if (generation !== this.generation) return;
        this._playing.set(true);
        this.watchProgress(audio);
      },
      // Lecture refusée ou extrait introuvable : on revient à l'état du repos.
      () => {
        if (generation === this.generation) this.stop();
      },
    );
  }

  private watchProgress(audio: PreviewAudio): void {
    const tick = () => {
      if (audio !== this.audio || audio.paused) return;
      this._progress.set(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private cancelFrame(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }
}
