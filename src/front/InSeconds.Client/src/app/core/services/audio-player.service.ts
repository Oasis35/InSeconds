import { Injectable, signal, computed } from '@angular/core';

export type AudioState = 'idle' | 'loading' | 'playing' | 'finished';

@Injectable({ providedIn: 'root' })
export class AudioPlayerService {
  private audio: HTMLAudioElement | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDuration = 0;
  private wasExtended = false;
  private playToken = 0; // incrémenté à chaque play/reset — invalide les callbacks périmés

  readonly state = signal<AudioState>('idle');
  readonly listenedSeconds = signal(0);
  readonly extended = signal(false);
  readonly progress = signal(0); // 0→1 pendant l'écoute

  private rafId: number | null = null;

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

    // Invalider tout callback en vol et nettoyer
    const token = ++this.playToken;
    if (this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    this.stopRaf();
    this.audio.pause();
    this.audio.oncanplay = null;
    this.audio.onerror = null;

    this.currentDuration = durationSeconds;
    this.wasExtended = false;
    this.extended.set(false);
    this.state.set('loading');

    this.audio.src = trackUrl;
    this.audio.oncanplay = () => {
      if (this.playToken !== token) return; // callback périmé, ignorer
      this.state.set('playing');
      this.progress.set(0);
      this.audio!.play().catch(() => { if (this.playToken === token) this.state.set('idle'); });
      this.scheduleStop(durationSeconds, token);
      this.startRaf(token);
    };

    this.audio.onerror = () => { if (this.playToken === token) this.state.set('idle'); };
    this.audio.load();
  }

  /** Rejoue le morceau déjà chargé depuis le début, jusqu'à la fin naturelle. */
  replayFull(): void {
    if (!this.audio?.src) return;

    const token = ++this.playToken;
    if (this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    this.stopRaf();

    this.audio.onended = () => {
      if (this.playToken !== token) return;
      this.audio!.onended = null;
      this.state.set('finished');
    };

    this.audio.currentTime = 0;
    this.state.set('playing');
    this.audio.play().catch(() => { if (this.playToken === token) this.state.set('idle'); });
  }

  /**
   * Prolonge l'écoute jusqu'à `nextDurationSeconds` (chaînable, pas de limite au nombre d'appels).
   * Si la lecture est en cours, continue depuis la position actuelle (pas de replay de l'intro).
   * Sinon (palier fini / idle), relit depuis le début jusqu'au nouveau palier.
   */
  extend(nextDurationSeconds: number): void {
    if (!this.audio) return;
    if (nextDurationSeconds <= this.currentDuration) return;

    this.wasExtended = true;
    this.extended.set(true);
    this.currentDuration = nextDurationSeconds;

    if (this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }

    if (this.state() === 'playing') {
      // Continue depuis la position réelle de lecture (pas un delta théorique) : pas de replay.
      const token = this.playToken; // continuité de la même lecture, pas un nouveau token
      const remaining = Math.max(0, nextDurationSeconds - this.audio.currentTime);
      this.scheduleStop(remaining, token);
      return;
    }

    // Pas en cours de lecture (fini / idle) : relit depuis le début jusqu'au nouveau palier.
    const token = ++this.playToken;
    this.stopRaf();
    this.audio.pause();
    this.audio.oncanplay = null; // évite qu'un `canplay` tardif ne rejoue le handler périmé de play()
    this.audio.onerror = null;

    this.audio.currentTime = 0;
    this.state.set('playing');
    this.progress.set(0);
    this.audio.play().catch(() => { if (this.playToken === token) this.state.set('idle'); });
    this.scheduleStop(nextDurationSeconds, token);
    this.startRaf(token);
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
    ++this.playToken; // invalider tout callback en vol
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.stopRaf();
    if (this.audio) {
      this.audio.oncanplay = null;
      this.audio.onerror = null;
      this.audio.onended = null;
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

  preloadAll(trackUrls: string[]): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve();
    for (const url of trackUrls) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'audio';
      link.href = url;
      document.head.appendChild(link);
    }
    return Promise.resolve();
  }

  private scheduleStop(seconds: number, token: number): void {
    this.stopTimer = setTimeout(() => {
      if (this.playToken === token) this.stop();
    }, seconds * 1000);
  }

  private startRaf(token: number): void {
    this.stopRaf();
    const tick = () => {
      if (this.playToken !== token) return;
      const elapsed = this.audio?.currentTime ?? 0;
      // Lit currentDuration à chaque frame (pas figé en paramètre) : reflète une éventuelle extension.
      this.progress.set(Math.min(elapsed / this.currentDuration, 1));
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
