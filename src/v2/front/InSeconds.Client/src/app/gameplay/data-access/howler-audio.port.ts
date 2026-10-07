import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Howl } from 'howler';
import { AudioStatus } from '../domain/track-round';
import { AudioPort } from './audio.port';

/** Un extrait chargé : le son décodé, et les segments qu'on lui a fait jouer. */
interface Entry {
  readonly howl: Howl;
  /** Passé à Howler, qui lit ses segments (`[début ms, durée ms]`) ici au moment de jouer. */
  readonly sprites: Record<string, [number, number]>;
  loaded: boolean;
}

/** Le segment en cours : il part de `from` et le navigateur l'arrête à `until`. */
interface Segment {
  readonly id: number;
  readonly token: number;
  readonly from: number;
  readonly until: number;
}

/** Howler ne garde son objet de segments que s'il n'est pas vide au chargement : on y met un segment sans effet. */
const PLACEHOLDER_SEGMENT: [number, number] = [0, 0];

/**
 * L'`AudioPort` sur **Howler.js en mode Web Audio** (décision du 01/10/2026). L'extrait est
 * téléchargé puis décodé en mémoire (le CDN de Deezer autorise CORS, vérifié le 02/10/2026), et
 * chaque palier est un segment que le navigateur joue avec une durée : il s'arrête à l'échantillon
 * près, sans chrono ni suivi de `currentTime`.
 *
 * - Prolonger pendant une lecture relance le son depuis la position atteinte, avec le nouveau palier.
 * - iPhone en mode silencieux : Web Audio y est muet par défaut, la session audio passe en
 *   `playback` quand le navigateur le permet (ticket Howler goldfire/howler.js#1767).
 * - Un seul extrait en cours et le suivant restent décodés ; les autres sont libérés.
 */
@Injectable()
export class HowlerAudioPort extends AudioPort {
  private readonly _state = signal<AudioStatus>('idle');
  readonly state = this._state.asReadonly();
  private readonly _position = signal(0);
  readonly position = this._position.asReadonly();

  private readonly entries = new Map<string, Entry>();
  private currentUrl: string | null = null;
  private segment: Segment | null = null;
  /** Jusqu'où jouer dès que le son sera prêt (demande faite pendant le chargement). */
  private pendingUntil: number | null = null;
  /** Invalide les rappels d'un segment ou d'un chargement périmé. */
  private token = 0;
  private frame: number | null = null;

  constructor() {
    super();
    this.keepPlayingOnSilentMode();
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  /** Les adresses dont le son est gardé en mémoire (pour les tests). */
  loadedUrls(): string[] {
    return [...this.entries.keys()];
  }

  load(url: string, nextUrl?: string | null): void {
    this.silence();
    this.pendingUntil = null;
    this._position.set(0);
    this.currentUrl = url;
    this._state.set('loading');

    this.releaseExcept([url, nextUrl ?? null]);
    const entry = this.entry(url);
    if (entry.loaded) this.onLoaded(url, nextUrl ?? null);
    else this.whenLoaded(entry, () => this.onLoaded(url, nextUrl ?? null), () => this.onLoadError(url));
  }

  playUntil(seconds: number): void {
    const state = this._state();
    if (state === 'loading') {
      this.pendingUntil = Math.max(this.pendingUntil ?? 0, seconds);
    } else if (state === 'ready' || state === 'finished') {
      this.start(this.position(), seconds);
    } else if (state === 'playing') {
      this.start(this.currentPosition(), seconds);
    }
  }

  replay(seconds: number): void {
    const state = this._state();
    if (state === 'loading') this.pendingUntil = seconds;
    else if (state === 'ready' || state === 'playing' || state === 'finished') this.start(0, seconds);
  }

  playFull(): void {
    const state = this._state();
    // pendant le chargement, la demande est gardée : tout l'extrait se jouera (start borne à sa durée)
    if (state === 'loading') this.pendingUntil = Number.MAX_SAFE_INTEGER;
    else if (state === 'ready' || state === 'playing' || state === 'finished') this.start(0, this.duration());
  }

  stop(): void {
    this.silence();
    this.pendingUntil = null;
    this.currentUrl = null;
    this._position.set(0);
    this._state.set('idle');
  }

  private entry(url: string): Entry {
    const existing = this.entries.get(url);
    if (existing) return existing;
    const sprites: Record<string, [number, number]> = { placeholder: PLACEHOLDER_SEGMENT };
    // `format` : l'adresse (signée, avec une requête) ne dit pas toujours quel est le format du fichier.
    const howl = new Howl({ src: [url], format: ['mp3'], html5: false, preload: true, sprite: sprites });
    const entry: Entry = { howl, sprites, loaded: false };
    this.entries.set(url, entry);
    // Un extrait qui échoue (même préchargé) ne reste pas en mémoire : le prochain chargement le télécharge de nouveau.
    howl.once('loaderror', () => {
      if (this.entries.get(url) !== entry) return;
      howl.unload();
      this.entries.delete(url);
    });
    return entry;
  }

  private whenLoaded(entry: Entry, onLoad: () => void, onError: () => void): void {
    const token = this.token;
    const loaded = () => {
      entry.loaded = true;
      if (token === this.token) onLoad();
    };
    if (entry.howl.state() === 'loaded') {
      loaded();
      return;
    }
    entry.howl.once('load', loaded);
    entry.howl.once('loaderror', () => {
      if (token === this.token) onError();
    });
  }

  private onLoaded(url: string, nextUrl: string | null): void {
    if (this.currentUrl !== url) return;
    this._state.set('ready');
    // Le suivant se décode une fois le courant prêt, pour ne pas lui prendre la bande passante.
    if (nextUrl && nextUrl !== url) this.entry(nextUrl);
    const until = this.pendingUntil;
    this.pendingUntil = null;
    if (until !== null) this.start(0, until);
  }

  private onLoadError(url: string): void {
    if (this.currentUrl !== url) return;
    // L'extrait en échec n'est pas gardé : « Réessayer » le télécharge de nouveau.
    this.entries.get(url)?.howl.unload();
    this.entries.delete(url);
    this._state.set('error');
  }

  /** Joue de `from` à `until` (borné à la durée de l'extrait), en remplaçant le segment en cours. */
  private start(from: number, until: number): void {
    const entry = this.currentUrl ? this.entries.get(this.currentUrl) : undefined;
    if (!entry) return;
    const end = Math.min(until, this.duration());
    this.silence();
    if (end <= from) {
      this._position.set(from);
      this._state.set('finished');
      return;
    }

    this.keepPlayingOnSilentMode();
    const token = ++this.token;
    const name = `segment-${token}`;
    entry.sprites[name] = [from * 1000, (end - from) * 1000];
    // Seuls les segments en cours ou à venir servent : on garde l'objet petit.
    for (const old of Object.keys(entry.sprites)) {
      if (old !== 'placeholder' && old !== name) delete entry.sprites[old];
    }

    const id = entry.howl.play(name);
    const failed = () => {
      if (this.token !== token) return;
      this.cancelFrame();
      this.segment = null;
      this._state.set('error');
    };
    if (typeof id !== 'number') {
      failed();
      return;
    }
    this.segment = { id, token, from, until: end };
    entry.howl.once('end', () => {
      if (this.token !== token) return;
      this.cancelFrame();
      this.segment = null;
      this._position.set(end);
      this._state.set('finished');
    }, id);
    entry.howl.once('playerror', failed, id);
    this._position.set(from);
    this._state.set('playing');
    this.watchPosition(token);
  }

  /** Coupe le segment en cours sans changer d'état : l'appelant décide de la suite. */
  private silence(): void {
    this.token++;
    this.cancelFrame();
    if (this.segment && this.currentUrl) this.entries.get(this.currentUrl)?.howl.stop(this.segment.id);
    this.segment = null;
  }

  private duration(): number {
    return (this.currentUrl && this.entries.get(this.currentUrl)?.howl.duration()) || 0;
  }

  /** La position réelle de lecture, de `from` à `until`. */
  private currentPosition(): number {
    const segment = this.segment;
    const entry = this.currentUrl ? this.entries.get(this.currentUrl) : undefined;
    if (!segment || !entry) return this._position();
    const position = entry.howl.seek(segment.id);
    return typeof position === 'number' ? Math.min(Math.max(position, segment.from), segment.until) : segment.from;
  }

  /** Alimente `position` pour la barre de progression (affichage seulement : rien n'en dépend pour s'arrêter). */
  private watchPosition(token: number): void {
    const tick = () => {
      if (this.token !== token || this._state() !== 'playing') return;
      this._position.set(this.currentPosition());
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

  private releaseExcept(keep: readonly (string | null)[]): void {
    for (const [url, entry] of this.entries) {
      if (keep.includes(url)) continue;
      entry.howl.unload();
      this.entries.delete(url);
    }
  }

  private dispose(): void {
    this.silence();
    this.releaseExcept([]);
  }

  /** `navigator.audioSession` n'existe que sur les navigateurs récents (Safari 17+) : sans effet ailleurs. */
  private keepPlayingOnSilentMode(): void {
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch {
      // une session audio verrouillée ne doit pas empêcher de jouer
    }
  }
}
