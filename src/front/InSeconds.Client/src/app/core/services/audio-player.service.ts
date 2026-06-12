import { Injectable, signal, computed } from '@angular/core';

export type AudioState = 'idle' | 'loading' | 'playing' | 'finished';

@Injectable({ providedIn: 'root' })
export class AudioPlayerService {
  private audio: HTMLAudioElement | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDuration = 0;
  private wasExtended = false;

  readonly state = signal<AudioState>('idle');
  readonly listenedSeconds = signal(0);
  readonly extended = signal(false);
  readonly progress = signal(0); // 0→1 pendant l'écoute

  private rafId: number | null = null;
  private startedAt = 0;

  readonly isIdle = computed(() => this.state() === 'idle');
  readonly isPlaying = computed(() => this.state() === 'playing');
  readonly isFinished = computed(() => this.state() === 'finished');

  constructor() {
    if (typeof document !== 'undefined') {
      this.audio = new Audio();
      (this.audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
    }
  }

  play(trackUrl: string, durationSeconds: number): void {
    if (!this.audio) return;

    this.currentDuration = durationSeconds;
    this.wasExtended = false;
    this.state.set('loading');

    this.audio.src = trackUrl;
    this.audio.oncanplay = () => {
      this.state.set('playing');
      this.progress.set(0);
      this.startedAt = performance.now();
      this.audio!.play().catch(() => this.state.set('idle'));
      this.scheduleStop(durationSeconds);
      this.startRaf(durationSeconds);
    };

    this.audio.onerror = () => this.state.set('idle');
    this.audio.load();
  }

  /** Une seule prolongation autorisée — passe au palier supérieur. */
  extend(nextDurationSeconds: number): void {
    if (this.wasExtended || this.state() !== 'playing') return;

    this.wasExtended = true;
    this.extended.set(true);

    const delta = nextDurationSeconds - this.currentDuration;
    this.currentDuration = nextDurationSeconds;

    if (this.stopTimer !== null) clearTimeout(this.stopTimer);
    this.scheduleStop(delta);
  }

  stop(): { listenedSeconds: number; wasExtended: boolean } {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.stopRaf();
    if (this.audio) this.audio.pause();

    this.progress.set(1);
    this.state.set('finished');
    this.listenedSeconds.set(this.currentDuration);
    navigator.vibrate?.(50);

    return { listenedSeconds: this.currentDuration, wasExtended: this.wasExtended };
  }

  reset(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.stopRaf();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
    this.state.set('idle');
    this.listenedSeconds.set(0);
    this.extended.set(false);
    this.progress.set(0);
    this.currentDuration = 0;
    this.wasExtended = false;
  }

  preloadNext(trackUrl: string): void {
    if (typeof document === 'undefined') return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'audio';
    link.href = trackUrl;
    document.head.appendChild(link);
  }

  private scheduleStop(seconds: number): void {
    this.stopTimer = setTimeout(() => this.stop(), seconds * 1000);
  }

  private startRaf(durationSeconds: number): void {
    this.stopRaf();
    const tick = () => {
      const elapsed = (performance.now() - this.startedAt) / 1000;
      this.progress.set(Math.min(elapsed / durationSeconds, 1));
      if (this.state() === 'playing') {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
