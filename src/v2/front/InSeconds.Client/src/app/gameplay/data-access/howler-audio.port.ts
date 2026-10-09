import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Howl, Howler } from 'howler';
import { AudioStatus } from '../domain/track-round';
import { AudioPort } from './audio.port';

/** Un extrait chargé : le son décodé, et les segments qu'on lui a fait jouer. */
interface Entry {
  readonly howl: Howl;
  /** Passé à Howler, qui lit ses segments (`[début ms, durée ms]`) ici au moment de jouer. */
  readonly sprites: Record<string, [number, number]>;
  loaded: boolean;
}

/** Le segment en cours : il part de `from` et le navigateur l'arrête à `until` (repoussé par « écouter plus »). */
interface Segment {
  readonly id: number;
  readonly token: number;
  readonly from: number;
  until: number;
  /** Le son Web Audio dont on programme l'arrêt, une fois que Howler l'a lancé ; `null` sans Web Audio. */
  source: AudioBufferSourceNode | null;
}

/** Les méthodes de déverrouillage de Howler 2.2.4 (version figée), absentes de ses types. */
type HowlerUnlock = typeof Howler & { autoUnlock?: boolean; _unlockAudio?: () => void; _autoResume?: () => void };

/** Ce que Howler 2.2.4 (version figée) garde d'un son en Web Audio, absent de ses types. */
interface HowlerSound {
  _playStart: number;
  _node?: { bufferSource?: AudioBufferSourceNode | null };
}
type HowlInternals = Howl & { _webAudio?: boolean; _soundById?: (id: number) => HowlerSound | null };

/** Howler ne garde son objet de segments que s'il n'est pas vide au chargement : on y met un segment sans effet. */
const PLACEHOLDER_SEGMENT: [number, number] = [0, 0];

/**
 * L'`AudioPort` sur **Howler.js en mode Web Audio** (décision du 01/10/2026). L'extrait est
 * téléchargé puis décodé en mémoire (le CDN de Deezer autorise CORS, vérifié le 02/10/2026), et
 * chaque palier est un segment que le navigateur joue avec une durée : il s'arrête à l'échantillon
 * près, sans chrono ni suivi de `currentTime`.
 *
 * - En Web Audio, le segment court jusqu'à la fin de l'extrait et l'arrêt au palier est programmé sur
 *   l'horloge audio (`AudioBufferSourceNode.stop(t)`) : prolonger pendant une lecture repousse cet
 *   arrêt, le son continue sans coupure (relancer le son depuis la position atteinte faisait un
 *   à-coup à chaque palier, signalé sur le staging le 09/10/2026). Sans Web Audio, le segment s'arrête
 *   au palier et prolonger le relance depuis la position atteinte.
 * - Prolonger quand le palier est joué (« écouter plus » à l'arrêt) relit depuis le début jusqu'au
 *   nouveau palier, comme en v1.
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
      // Arrêté à un palier : la lecture repart du début jusqu'au nouveau palier (comme en v1).
      this.start(0, seconds);
    } else if (state === 'playing' && !this.extend(seconds)) {
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

  /**
   * Howler ne crée son contexte audio qu'au premier extrait, et ne le déverrouille qu'au geste
   * suivant ; sur iPhone (fréquence de 48 kHz), il le recrée même à ce moment-là. Après les appels
   * réseau du démarrage d'une partie, le clic est passé : le premier morceau attendrait en silence
   * le prochain toucher. On fait donc tout ici, dans le clic, avant le premier extrait : création du
   * contexte, déverrouillage de Howler (qui ne se refera plus), puis relance du contexte, que Howler
   * note « en marche » pour jouer sans attendre.
   */
  unlock(): void {
    try {
      const howler = Howler as HowlerUnlock;
      howler.volume(); // crée le contexte audio s'il n'existe pas encore
      if (howler.autoUnlock) howler._unlockAudio?.();
      howler._autoResume?.();
    } catch {
      // sans Web Audio, Howler se rabat sur un élément audio : rien à déverrouiller ici
    }
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
    const howl = entry.howl as HowlInternals;
    // En Web Audio, le son va jusqu'au bout de l'extrait : c'est l'arrêt programmé qui le coupe au palier.
    const scheduled = !!howl._webAudio && typeof howl._soundById === 'function';
    const segmentEnd = scheduled ? this.duration() : end;
    entry.sprites[name] = [from * 1000, (segmentEnd - from) * 1000];
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
    const segment: Segment = { id, token, from, until: end, source: null };
    this.segment = segment;
    if (scheduled && !this.scheduleStop(segment)) {
      // contexte audio pas encore en marche : Howler lance le son à la reprise, l'arrêt se programme alors
      entry.howl.once('play', () => {
        if (this.token === token) this.scheduleStop(segment);
      }, id);
    }
    entry.howl.once('end', () => {
      if (this.token !== token) return;
      this.cancelFrame();
      this.segment = null;
      this._position.set(segment.until);
      this._state.set('finished');
    }, id);
    entry.howl.once('playerror', failed, id);
    this._position.set(from);
    this._state.set('playing');
    this.watchPosition(token);
  }

  /** Repousse l'arrêt du segment en cours sans couper le son ; `false` s'il faut relancer le son. */
  private extend(seconds: number): boolean {
    const segment = this.segment;
    if (!segment?.source) return false;
    const until = Math.min(seconds, this.duration());
    if (until <= segment.until) return true;
    const previous = segment.until;
    segment.until = until;
    if (this.scheduleStop(segment)) return true;
    segment.until = previous;
    return false;
  }

  /**
   * Programme l'arrêt du son à `until`, sur l'horloge audio : le navigateur coupe à l'échantillon
   * près. Un nouvel appel remplace l'arrêt précédent (Web Audio : seul le dernier `stop(t)` compte).
   * `false` si le son n'est pas encore lancé, ou déjà arrêté.
   */
  private scheduleStop(segment: Segment): boolean {
    const entry = this.currentUrl ? this.entries.get(this.currentUrl) : undefined;
    const sound = (entry?.howl as HowlInternals | undefined)?._soundById?.(segment.id);
    const source = sound?._node?.bufferSource;
    const context = Howler.ctx;
    if (!entry || !sound || !source || !context) return false;
    const when = Math.max(sound._playStart + (segment.until - segment.from), context.currentTime);
    try {
      source.stop(when);
    } catch {
      return false;
    }
    if (segment.source !== source) {
      segment.source = source;
      source.addEventListener('ended', () => this.onScheduledStop(segment), { once: true });
    }
    return true;
  }

  /** L'arrêt programmé a eu lieu : le palier est joué, Howler libère le son. */
  private onScheduledStop(segment: Segment): void {
    if (this.token !== segment.token) return;
    this.token++;
    this.cancelFrame();
    this.segment = null;
    if (this.currentUrl) this.entries.get(this.currentUrl)?.howl.stop(segment.id);
    this._position.set(segment.until);
    this._state.set('finished');
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
