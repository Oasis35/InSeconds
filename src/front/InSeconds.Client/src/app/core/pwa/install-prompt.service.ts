import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { StoragePort } from '../storage/storage.port';
import { InstallContext, InstallMode, installMode } from './install-environment';

/** L'événement `beforeinstallprompt` de Chromium (Android) : pas dans les types du DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const LINE_DISMISSED_KEY = 'inseconds.install-line-dismissed';

/**
 * L'installation de l'appli sur l'écran d'accueil. Android : le navigateur prévient (`beforeinstallprompt`), on garde l'événement et un bouton le
 * rejoue. iPhone : rien à déclencher, on montre les étapes de Safari. Ordinateur, appli déjà installée, autre navigateur d'iPhone : `mode()` est `null`
 * et rien ne s'affiche. La fermeture de la ligne de l'accueil est gardée dans le navigateur (jamais côté serveur, rien de personnel).
 */
@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StoragePort);

  private readonly nativeEvent = signal<BeforeInstallPromptEvent | null>(null);
  private readonly installed = signal(false);
  private readonly _lineDismissed = signal(false);
  private started = false;

  readonly lineDismissed = this._lineDismissed.asReadonly();

  readonly mode = computed<InstallMode | null>(() => {
    if (this.installed()) return null;
    return installMode(this.context(this.nativeEvent() !== null));
  });

  /** Au démarrage de l'app : `beforeinstallprompt` ne part qu'une fois, tôt, avant que l'accueil existe. */
  init(): void {
    if (this.started) return;
    this.started = true;
    this._lineDismissed.set(this.storage.get(LINE_DISMISSED_KEY) === '1');
    const view = this.document.defaultView;
    if (!view) return;
    view.addEventListener('beforeinstallprompt', event => {
      // Sans preventDefault, le navigateur affiche sa propre invite et l'événement ne peut plus être rejoué.
      event.preventDefault();
      this.nativeEvent.set(event as BeforeInstallPromptEvent);
    });
    view.addEventListener('appinstalled', () => {
      this.nativeEvent.set(null);
      this.installed.set(true);
    });
  }

  /** Le bouton « Ajouter » d'Android : l'invite du navigateur. Rendu `true` si le joueur a accepté. Un événement ne se rejoue qu'une fois. */
  async promptNative(): Promise<boolean> {
    const event = this.nativeEvent();
    if (!event) return false;
    this.nativeEvent.set(null);
    try {
      await event.prompt();
      return (await event.userChoice).outcome === 'accepted';
    } catch {
      // Le navigateur refuse de rejouer l'invite (InvalidStateError) : ce n'est pas une erreur du joueur, rien à remonter.
      return false;
    }
  }

  dismissLine(): void {
    this._lineDismissed.set(true);
    this.storage.set(LINE_DISMISSED_KEY, '1');
  }

  private context(nativePromptReady: boolean): InstallContext {
    const view = this.document.defaultView;
    const navigator = view?.navigator;
    const standalone = view?.matchMedia?.('(display-mode: standalone)').matches === true
      || (navigator as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
    return {
      environment: { userAgent: navigator?.userAgent ?? '', platform: navigator?.platform ?? '', maxTouchPoints: navigator?.maxTouchPoints ?? 0 },
      standalone,
      touch: view?.matchMedia?.('(pointer: coarse)').matches === true,
      nativePromptReady,
    };
  }
}
