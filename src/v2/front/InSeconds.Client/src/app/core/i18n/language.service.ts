import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { StoragePort } from '../storage/storage.port';

export const SUPPORTED_LANGS = ['fr', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: Lang = 'fr';
const STORAGE_KEY = 'lang';

/**
 * Langue de l'interface (repris de la v1) : choix mémorisé, sinon langue du navigateur, sinon
 * français. Appliquée à ngx-translate et à `<html lang>`.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly storage = inject(StoragePort);
  private readonly document = inject(DOCUMENT);

  private readonly _current = signal<Lang>(DEFAULT_LANG);
  readonly current = this._current.asReadonly();

  /** Appelé au démarrage (provideAppInitializer). */
  init(): void {
    this.translate.addLangs([...SUPPORTED_LANGS]);
    this.translate.setFallbackLang(DEFAULT_LANG);
    this.apply(this.detect());
  }

  /** Choix explicite du joueur : appliqué et mémorisé. */
  use(lang: Lang): void {
    this.apply(lang);
    this.storage.set(STORAGE_KEY, lang);
  }

  private apply(lang: Lang): void {
    this.translate.use(lang);
    this._current.set(lang);
    this.document.documentElement.lang = lang;
  }

  private detect(): Lang {
    const stored = this.storage.get(STORAGE_KEY);
    if (isSupported(stored)) return stored;

    const browser = this.document.defaultView?.navigator.language?.slice(0, 2).toLowerCase();
    if (isSupported(browser)) return browser;

    return DEFAULT_LANG;
  }
}

export function isSupported(value: string | null | undefined): value is Lang {
  return value != null && (SUPPORTED_LANGS as readonly string[]).includes(value);
}
