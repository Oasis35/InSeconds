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

  private readonly preloaded = new Set<string>();
  private readonly preloadBuffers = new Map<string, HTMLAudioElement>();

  async preloadAll(trackUrls: string[]): Promise<void> {
    for (const url of trackUrls) {
      await this.preloadOne(url);
    }
  }

  private preloadOne(trackUrl: string): Promise<void> {
    if (typeof Audio === 'undefined' || this.preloaded.has(trackUrl)) {
      return Promise.resolve();
    }
    this.preloaded.add(trackUrl);
    return new Promise<void>(resolve => {
      const a = new Audio();
      a.preload = 'auto';
      a.oncanplaythrough = () => resolve();
      a.onerror = () => resolve(); // ne pas bloquer si une URL échoue
      a.src = trackUrl;
      this.preloadBuffers.set(trackUrl, a);
    });
  }

  preload(trackUrl: string): void {
    this.preloadOne(trackUrl);
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
