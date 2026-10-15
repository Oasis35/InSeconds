import { DestroyRef, Injectable, Injector, inject, signal } from '@angular/core';
import { ErrorReportingService } from '../../core/errors/error-reporting.service';
import { AudioStatus } from '../domain/track-round';
import { AudioPort } from './audio.port';

/** Marge sous laquelle le palier est considéré atteint. */
const STOP_TOLERANCE_SECONDS = 0.01;

/** Délai minimal entre deux relectures de la position par le chrono d'arrêt (lecture bloquée). */
const MIN_RECHECK_MS = 20;

/** 10 ms de silence (WAV mono 8 kHz), joués dans le clic pour déverrouiller l'élément sur iPhone. */
const SILENCE_WAV_BASE64 =
  'UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

/** Délai entre l'ordre de lecture et le premier son au-delà duquel le palier est remonté (diagnostic iPhone). */
const SLOW_START_REPORT_MS = 1500;

/** Début du message remonté pour un palier lent à démarrer ou coupé en route : c'est lui qu'on cherche dans Grafana. */
export const AUDIO_STALL_MESSAGE = 'AudioStall';

/** Le déroulé réel d'un palier : quand le son est parti, combien de fois il s'est arrêté en route. */
interface PlaybackTimings {
  startedAt: number;
  firstSoundAt: number | null;
  waitingSince: number | null;
  stalls: number;
  stallMs: number;
}

/**
 * Le message d'un palier lent à démarrer (plus de 1,5 s avant le premier son) ou coupé en route
 * (`waiting` après le début du son) ; `null` si le palier s'est bien passé. Durées arrondies à
 * 100 ms : deux paliers semblables donnent le même message (dédupliqué par la remontée).
 */
export function describeStall(untilSeconds: number, timings: PlaybackTimings, endedAt: number): string | null {
  const startMs = (timings.firstSoundAt ?? endedAt) - timings.startedAt;
  if (timings.stalls === 0 && startMs <= SLOW_START_REPORT_MS) return null;
  const round = (ms: number) => Math.round(ms / 100) * 100;
  const cuts = timings.stalls === 0 ? 'aucune coupure' : `${timings.stalls} coupure${timings.stalls > 1 ? 's' : ''} (${round(timings.stallMs)} ms)`;
  return `${AUDIO_STALL_MESSAGE}: palier ${untilSeconds} s, premier son après ${round(startMs)} ms, ${cuts}`;
}

/** `play()` rejeté parce qu'interrompu par notre propre `pause()` ou un changement de source : pas une panne. */
function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * L'`AudioPort` sur un **élément audio HTML**, la mécanique du lecteur de la v1, rodée en prod
 * (décision du 13/10/2026, #309, après la recette sur iPhone de Howler). Aucune bibliothèque : un
 * seul élément `Audio` (`playsInline`) joue tous les extraits, en flux depuis le CDN de Deezer.
 *
 * - **Arrêt au palier calé sur le son réel** (piège 44) : le chrono part à l'événement `playing`
 *   pour le reliquat (palier − `currentTime`), il est suspendu sur `waiting`, et une boucle
 *   `requestAnimationFrame` coupe dès que `currentTime` atteint le palier.
 * - **Jamais de coupure à l'aveugle** (piège 46) : à l'échéance, le chrono relit la position et se
 *   reprogramme si le palier n'est pas atteint ; rien ne coupe pendant un `seeking` (juste après
 *   `currentTime = 0`, Safari peut encore renvoyer l'ancienne position). Sur iPhone, `playing` part
 *   parfois dès l'appel à `play()`, bien avant le son.
 * - « Écouter plus » pendant la lecture reprogramme l'arrêt sans couper le son ; à l'arrêt, la
 *   lecture repart du début jusqu'au nouveau palier ; pendant le chargement, la demande est gardée
 *   (piège 40).
 * - Un extrait plus court que le palier : la fin de l'extrait est la fin du palier.
 * - Un échec donne `error`, jamais `idle` (piège 33) ; un échec de la lecture complète (après la
 *   révélation) donne `finished` : il n'y a plus rien à proposer au joueur.
 * - Le suivant est seulement annoncé au navigateur (`<link rel="preload" as="audio">`), une fois
 *   le courant prêt, comme en v1 : rien n'est décodé en mémoire.
 * - L'extrait est lu en flux : une adresse dont la signature expire en cours de route (piège 14)
 *   donne `error`, et « Réessayer » en redemande une fraîche (`refreshPreviewUrl`).
 */
@Injectable()
export class HtmlAudioPort extends AudioPort {
  private readonly _state = signal<AudioStatus>('idle');
  readonly state = this._state.asReadonly();
  private readonly _position = signal(0);
  readonly position = this._position.asReadonly();

  private readonly audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  /** Invalide les rappels d'un chargement périmé (`canplay`, `error`). */
  private loadToken = 0;
  /** Invalide les rappels d'une lecture périmée (`playing`, `waiting`, `ended`, chrono, boucle). */
  private playToken = 0;
  /** Le palier en cours ; `Infinity` pour tout l'extrait (après la révélation). */
  private until = 0;
  /** Jusqu'où jouer dès que le son sera prêt (demande faite pendant le chargement). */
  private pendingUntil: number | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private frame: number | null = null;
  private preloadLink: HTMLLinkElement | null = null;
  private silenceUrl: string | null = null;
  private unlocked = false;
  /** Le déroulé du palier en cours, pour le diagnostic des sons lents ou coupés sur iPhone. */
  private timings: PlaybackTimings | null = null;
  /** Résolu au premier envoi seulement : le lecteur n'impose pas `HttpClient` à ses tests. */
  private readonly injector = inject(Injector);

  constructor() {
    super();
    if (typeof document !== 'undefined') {
      this.audio = new Audio();
      // iPhone : lire dans la page, jamais en plein écran (absent du type `HTMLAudioElement`).
      this.audio.setAttribute('playsinline', '');
    }
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  load(url: string, nextUrl?: string | null): void {
    const audio = this.audio;
    this.halt();
    this.pendingUntil = null;
    this.currentUrl = url;
    this._position.set(0);
    this._state.set('loading');
    if (!audio) return;

    const token = ++this.loadToken;
    audio.oncanplay = () => {
      if (this.loadToken !== token) return;
      audio.oncanplay = null; // `canplay` se répète (rebuffering, retour au début) : un seul démarrage
      this._state.set('ready');
      // Le suivant n'est annoncé qu'une fois le courant prêt, pour ne pas lui prendre la bande passante.
      this.preload(nextUrl ?? null);
      const until = this.pendingUntil;
      this.pendingUntil = null;
      if (until !== null) this.start(until);
    };
    audio.onerror = () => {
      if (this.loadToken !== token || this._state() === 'idle') return;
      this.halt();
      this._state.set('error');
    };
    audio.src = url;
    audio.load();
  }

  playUntil(seconds: number): void {
    const state = this._state();
    if (state === 'loading') {
      this.pendingUntil = Math.max(this.pendingUntil ?? 0, seconds);
    } else if (state === 'ready' || state === 'finished') {
      // Arrêté à un palier : la lecture repart du début jusqu'au nouveau palier (comme en v1).
      this.start(seconds);
    } else if (state === 'playing' && seconds > this.until) {
      // Pendant la lecture : le son continue depuis la position atteinte, seul l'arrêt est repoussé.
      this.until = seconds;
      this.scheduleStop(this.playToken);
    }
  }

  replay(seconds: number): void {
    const state = this._state();
    if (state === 'loading') this.pendingUntil = seconds;
    else if (state === 'ready' || state === 'playing' || state === 'finished') this.start(seconds);
  }

  playFull(): void {
    const state = this._state();
    if (state === 'loading') this.pendingUntil = Number.POSITIVE_INFINITY;
    else if (state === 'ready' || state === 'playing' || state === 'finished') this.start(Number.POSITIVE_INFINITY);
  }

  /**
   * Sur iPhone, un élément audio ne joue hors d'un geste du joueur qu'après avoir joué une fois
   * dans un geste. La manche ne démarre qu'après les appels réseau de « Commencer » : on fait donc
   * jouer l'élément partagé ici, dans le clic, jusqu'à ce qu'un essai passe. Un refus se retente au
   * clic suivant (« Piste suivante », « Réessayer »), même avec un extrait chargé (#313) :
   * - rien de chargé, ou un extrait en échec (« Réessayer » le rechargera) : un silence de 10 ms ;
   * - un extrait chargé ou en cours de chargement : l'élément le joue en muet puis revient où il
   *   était, sans couper l'extrait ni sa demande de lecture en attente ;
   * - un extrait en lecture : l'élément joue déjà, il est déverrouillé.
   */
  unlock(): void {
    const audio = this.audio;
    if (!audio || this.unlocked) return;
    const state = this._state();
    this.unlocked = true;
    if (state === 'playing') return;
    if (this.currentUrl !== null && state !== 'error') {
      this.unlockLoaded(audio);
      return;
    }
    const token = ++this.loadToken;
    audio.oncanplay = null;
    audio.onerror = null;
    audio.src = this.silence();
    audio.play().then(
      () => {
        if (this.loadToken === token) audio.pause();
      },
      (err: unknown) => {
        // Refusé (pas dans un geste) : on réessaiera au prochain clic. Interrompu par le chargement d'un extrait : c'est fait.
        if (!isAbort(err)) this.unlocked = false;
      },
    );
  }

  /** Déverrouille sur l'extrait chargé : lecture muette aussitôt arrêtée, à la position d'avant. */
  private unlockLoaded(audio: HTMLAudioElement): void {
    const playToken = this.playToken;
    const loadToken = this.loadToken;
    const time = audio.currentTime;
    audio.muted = true;
    audio.play().then(
      () => {
        audio.muted = false;
        // Une vraie lecture a pris la suite (demande gardée pendant le chargement) : on la laisse.
        if (this.playToken !== playToken || this.loadToken !== loadToken) return;
        audio.pause();
        audio.currentTime = time;
      },
      (err: unknown) => {
        audio.muted = false;
        if (!isAbort(err)) this.unlocked = false;
      },
    );
  }

  stop(): void {
    this.halt();
    this.loadToken++;
    this.pendingUntil = null;
    this.currentUrl = null;
    this._position.set(0);
    this._state.set('idle');
  }

  /** Joue depuis le début jusqu'à `until` (`Infinity` : jusqu'à la fin de l'extrait). */
  private start(until: number): void {
    const audio = this.audio;
    if (!audio || !this.currentUrl) return;
    this.halt();
    const token = ++this.playToken;
    const full = until === Number.POSITIVE_INFINITY;
    this.until = until;

    if (full) {
      audio.onplaying = null;
      audio.onwaiting = null;
    } else {
      audio.onplaying = () => {
        if (this.playToken !== token) return;
        this.endStall();
        this.scheduleStop(token);
      };
      // Son bloqué en cours de route (réseau) : le chrono est suspendu, `playing` le reprogrammera.
      audio.onwaiting = () => {
        if (this.playToken !== token) return;
        this.clearStopTimer();
        if (this.timings?.firstSoundAt != null) this.timings.waitingSince ??= performance.now();
      };
    }
    this.timings = full ? null : { startedAt: performance.now(), firstSoundAt: null, waitingSince: null, stalls: 0, stallMs: 0 };
    // Fin de l'extrait : le palier (ou l'extrait entier) est joué.
    audio.onended = () => {
      if (this.playToken === token && this._state() === 'playing') this.finish(token);
    };

    audio.muted = false; // un déverrouillage muet encore en cours ne doit pas couper le son du palier
    if (audio.currentTime !== 0) audio.currentTime = 0;
    this._position.set(0);
    this._state.set('playing');
    audio.play().catch((err: unknown) => {
      if (this.playToken !== token || isAbort(err)) return;
      this.halt();
      this._state.set(full ? 'finished' : 'error');
    });
    this.watch(token);
  }

  /** Le palier est joué : le son s'arrête, la position se fige à la fin du palier. */
  private finish(token: number): void {
    const audio = this.audio;
    if (this.playToken !== token || !audio) return;
    this.reportStall();
    this.halt();
    const duration = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime;
    this._position.set(audio.ended || this.until === Number.POSITIVE_INFINITY ? Math.min(this.until, duration) : this.until);
    this._state.set('finished');
  }

  /**
   * Programme l'arrêt pour le reliquat *réellement* restant (palier − position de lecture). Le chrono
   * ne coupe jamais à l'aveugle : à son échéance, il relit la position et se reprogramme si le palier
   * n'est pas atteint (piège 46).
   */
  private scheduleStop(token: number): void {
    this.clearStopTimer();
    if (this.until === Number.POSITIVE_INFINITY) return;
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      if (this.playToken !== token || this._state() !== 'playing') return;
      if (this.reachedUntil()) this.finish(token);
      else this.scheduleStop(token);
    }, Math.max(MIN_RECHECK_MS, this.remainingSeconds() * 1000));
  }

  private remainingSeconds(): number {
    return Math.max(0, this.until - (this.audio?.currentTime ?? 0));
  }

  /** Palier atteint d'après la position réelle ; jamais pendant un `seeking` (piège 46). */
  private reachedUntil(): boolean {
    const audio = this.audio;
    if (!audio || audio.seeking) return false;
    return audio.ended || this.remainingSeconds() <= STOP_TOLERANCE_SECONDS;
  }

  /**
   * Alimente `position` (barre de progression) et coupe à la frame près dès que le palier est
   * atteint ; le chrono de `scheduleStop` couvre une boucle suspendue (onglet en arrière-plan).
   */
  private watch(token: number): void {
    const tick = () => {
      if (this.playToken !== token || this._state() !== 'playing') return;
      const audio = this.audio!;
      if (this.timings && this.timings.firstSoundAt === null && audio.currentTime > 0) this.timings.firstSoundAt = performance.now();
      this._position.set(Math.min(audio.currentTime, this.until));
      if (this.until !== Number.POSITIVE_INFINITY && this.reachedUntil()) {
        this.finish(token);
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Coupe la lecture en cours sans changer d'état : l'appelant décide de la suite. */
  private halt(): void {
    this.playToken++;
    this.clearStopTimer();
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    const audio = this.audio;
    if (!audio) return;
    audio.onplaying = null;
    audio.onwaiting = null;
    audio.onended = null;
    audio.pause();
  }

  /** Le son repart après un `waiting` : la coupure est comptée. */
  private endStall(): void {
    const timings = this.timings;
    if (timings?.waitingSince == null) return;
    timings.stalls++;
    timings.stallMs += performance.now() - timings.waitingSince;
    timings.waitingSince = null;
  }

  /**
   * Remonte un palier lent à démarrer ou coupé en route (diagnostic de la recette iPhone, sans rien
   * changer au jeu) : jamais l'adresse de l'extrait. L'appareil est déduit par l'API.
   */
  private reportStall(): void {
    this.endStall(); // une coupure encore en cours à la fin du palier compte aussi
    const timings = this.timings;
    this.timings = null;
    if (!timings) return;
    const message = describeStall(this.until, timings, performance.now());
    if (message) this.injector.get(ErrorReportingService).report({ source: 'js', message });
  }

  private clearStopTimer(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }

  /** Annonce l'extrait suivant au navigateur ; un seul à la fois. */
  private preload(url: string | null): void {
    this.preloadLink?.remove();
    this.preloadLink = null;
    if (!url || url === this.currentUrl || typeof document === 'undefined') return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'audio';
    link.href = url;
    document.head.appendChild(link);
    this.preloadLink = link;
  }

  /** Le silence du déverrouillage, en adresse `blob:` (la CSP n'autorise pas `data:` pour les sons). */
  private silence(): string {
    if (this.silenceUrl === null) {
      const bytes = Uint8Array.from(atob(SILENCE_WAV_BASE64), c => c.codePointAt(0)!);
      this.silenceUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    }
    return this.silenceUrl;
  }

  private dispose(): void {
    this.stop();
    this.preload(null);
    if (this.audio) {
      this.audio.oncanplay = null;
      this.audio.onerror = null;
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    if (this.silenceUrl !== null) URL.revokeObjectURL(this.silenceUrl);
  }
}
