import { Injectable, signal, computed } from '@angular/core';

/** Marge sous laquelle le palier est considéré atteint par la boucle rAF. */
const STOP_TOLERANCE_SECONDS = 0.01;

/** `play()` rejeté parce qu'interrompu par pause()/load() — pas une panne de lecture. */
function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export type AudioState = 'idle' | 'loading' | 'playing' | 'finished' | 'error';

@Injectable({ providedIn: 'root' })
export class AudioPlayerService {
  private readonly audio: HTMLAudioElement | null = null;
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
  readonly isError = computed(() => this.state() === 'error');

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
    this.audio.onended = null;
    this.audio.onplaying = null;
    this.audio.onwaiting = null;

    this.currentDuration = durationSeconds;
    this.wasExtended = false;
    this.extended.set(false);
    this.state.set('loading');

    this.audio.src = trackUrl;
    this.audio.oncanplay = () => {
      if (this.playToken !== token) return; // callback périmé, ignorer
      this.audio!.oncanplay = null; // canplay peut se répéter (seek, rebuffering) : un seul démarrage
      this.state.set('playing');
      this.progress.set(0);
      // 'error', jamais 'idle' : un retour à 'idle' relancerait en boucle l'autoplay de
      // BlindRoundComponent (effect sur isIdle()), cf. piège E4 CLAUDE.md.
      this.startPlayback(token);
    };

    this.audio.onerror = () => { if (this.playToken === token) this.state.set('error'); };
    this.audio.load();
  }

  /**
   * Relit le palier en cours depuis le début, jusqu'à l'arrêt automatique à `currentDuration`
   * (bouton ↺ pendant l'écoute). Contrairement à `play()`, ne réinitialise ni `wasExtended` ni
   * `extended` — ce n'est pas un nouveau palier, juste une relecture du même, cf. piège M12
   * CLAUDE.md (le bouton fait actuellement croire à une prolongation jamais eue dans les stats
   * admin `ExtendedRate`).
   */
  replayCurrent(): void {
    if (!this.audio?.src || this.state() === 'error') return;

    const token = ++this.playToken;
    if (this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    this.stopRaf();
    this.audio.oncanplay = null;
    this.audio.onerror = null;
    this.audio.onended = null;

    this.audio.currentTime = 0;
    this.state.set('playing');
    this.progress.set(0);
    this.startPlayback(token);
  }

  /** Rejoue le morceau déjà chargé depuis le début, jusqu'à la fin naturelle. */
  replayFull(): void {
    // Rien à rejouer si la source n'a jamais chargé avec succès (cf. piège E4 CLAUDE.md) —
    // éviter une nouvelle tentative de lecture sur une source déjà en échec.
    if (!this.audio?.src || this.state() === 'error') return;

    const token = ++this.playToken;
    if (this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    this.stopRaf();
    this.audio.onplaying = null; // pas d'arrêt sur palier : lecture jusqu'à la fin naturelle
    this.audio.onwaiting = null;

    this.audio.onended = () => {
      if (this.playToken !== token) return;
      this.audio!.onended = null;
      this.state.set('finished');
    };

    this.audio.currentTime = 0;
    this.state.set('playing');
    // 'finished', jamais 'idle' : le round est terminé, rien à proposer au joueur, et un
    // retour à 'idle' relancerait l'autoplay de BlindRoundComponent (cf. piège 33 CLAUDE.md).
    this.audio.play().catch((err: unknown) => {
      if (this.playToken === token && !isAbort(err)) this.state.set('finished');
    });
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

    // Le palier n'a pas encore commencé à jouer (chargement en cours) : rien d'autre à faire
    // maintenant, currentDuration est déjà à jour et le gestionnaire oncanplay de play() le
    // relit à son déclenchement pour programmer l'arrêt sur la bonne valeur. Sans cette garde,
    // le code tombait dans la branche "pas en cours de lecture" ci-dessous, qui programmait un
    // arrêt dès maintenant (avant même que la lecture réelle ait commencé) — écoute
    // effectivement plus courte que le palier choisi (cf. piège M11 CLAUDE.md).
    if (this.state() === 'loading') return;

    if (this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }

    if (this.state() === 'playing') {
      // Continue depuis la position réelle de lecture, sans replay ni nouveau token :
      // scheduleStop() calcule le reliquat d'après currentTime.
      this.scheduleStop(this.playToken);
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
    // 'error', jamais 'idle' : un retour à 'idle' relançait l'autoplay de BlindRoundComponent
    // au premier palier (palier choisi remis à 0,5s), cf. piège 44 CLAUDE.md.
    this.startPlayback(token);
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
      this.audio.onplaying = null;
      this.audio.onwaiting = null;
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

  /**
   * Lance la lecture d'un palier. L'arrêt se cale sur le son réellement joué, pas sur l'heure
   * de l'appel (cf. piège 44 CLAUDE.md) : sur mobile, le son met parfois plusieurs centaines de
   * millisecondes à sortir après `play()`, un chrono lancé à l'appel coupait donc le palier
   * avant la fin (voire avant tout son à 0,5s). Le chrono part à l'événement `playing` et la
   * boucle rAF coupe dès que `currentTime` atteint le palier.
   */
  private startPlayback(token: number): void {
    const audio = this.audio!;
    audio.onplaying = () => { if (this.playToken === token) this.scheduleStop(token); };
    // Son bloqué en cours de route (réseau) : suspendre le chrono, `playing` le reprogrammera.
    audio.onwaiting = () => {
      if (this.playToken === token && this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    };
    // Extrait plus court que le palier : fin naturelle = palier écouté en entier.
    audio.onended = () => { if (this.playToken === token && this.state() === 'playing') this.stop(); };
    audio.play().catch((err: unknown) => {
      // AbortError = lecture interrompue par notre propre pause()/changement de source, pas
      // une vraie panne : ne rien afficher (sinon « Réessayer » apparaîtrait à tort).
      if (this.playToken === token && !isAbort(err)) this.state.set('error');
    });
    this.startRaf(token);
  }

  /**
   * Programme l'arrêt au palier courant pour le reliquat *réellement* restant à écouter
   * (palier − position de lecture). Appelé à l'événement `playing` — donc une fois le son sorti,
   * et de nouveau après chaque coupure de chargement (`waiting` suspend le chrono).
   */
  private scheduleStop(token: number): void {
    if (this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    const remaining = Math.max(0, this.currentDuration - (this.audio?.currentTime ?? 0));
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      if (this.playToken === token && this.state() === 'playing') this.stop();
    }, remaining * 1000);
  }

  private startRaf(token: number): void {
    this.stopRaf();
    const tick = () => {
      if (this.playToken !== token) return;
      const elapsed = this.audio?.currentTime ?? 0;
      // Lit currentDuration à chaque frame (pas figé en paramètre) : reflète une éventuelle extension.
      this.progress.set(Math.min(elapsed / this.currentDuration, 1));
      // Arrêt précis (~1 frame) sur la position réelle ; le chrono de scheduleStop() couvre le
      // cas où rAF est suspendu (onglet en arrière-plan, écran éteint).
      if (this.state() === 'playing' && elapsed >= this.currentDuration - STOP_TOLERANCE_SECONDS) {
        this.stop();
        return;
      }
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
