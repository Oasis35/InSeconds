import { Injectable, signal } from '@angular/core';

/** Lecteur audio partagé par les modales ajout/écoute du pool admin (preview 30s Deezer). */
@Injectable()
export class PoolAudioPreviewService {
  readonly playing = signal(false);
  readonly progress = signal(0); // 0-100

  private audio: HTMLAudioElement | null = null;
  private rafId: number | null = null;

  /** Joue `url`, ou bascule play/pause si c'est déjà la piste en cours. No-op si `url` est absent. */
  toggle(url: string | null | undefined): void {
    if (!url) return;
    if (this.playing()) { this.pause(); return; }

    if (this.audio?.src !== url) {
      this.stop();
      this.audio = new Audio(url);
      this.audio.onended = () => {
        this.playing.set(false);
        this.progress.set(100);
        if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
      };
    }

    const audio = this.audio;
    if (!audio) return;
    audio.play().then(() => {
      this.playing.set(true);
      const tick = () => {
        const current = this.audio;
        if (!current || current.paused) return;
        const pct = current.duration ? (current.currentTime / current.duration) * 100 : 0;
        this.progress.set(pct);
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }).catch(() => {});
  }

  private pause(): void {
    this.audio?.pause();
    this.playing.set(false);
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  stop(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this.audio) { this.audio.pause(); this.audio.onended = null; this.audio = null; }
    this.playing.set(false);
  }
}
