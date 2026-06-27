import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export const SUPPORTED_LANGS = ['fr', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

const DEFAULT_LANG: Lang = 'fr';
const STORAGE_KEY = 'lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);

  readonly current = signal<Lang>(DEFAULT_LANG);

  /** Appelé au boot (provideAppInitializer) : détermine et applique la langue. */
  init(): void {
    this.translate.addLangs([...SUPPORTED_LANGS]);
    this.translate.setFallbackLang(DEFAULT_LANG);
    this.use(this.detect());
  }

  use(lang: Lang): void {
    this.translate.use(lang);
    this.current.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage indisponible (mode privé strict) — non bloquant
    }
    document.documentElement.lang = lang;
  }

  private detect(): Lang {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    if (this.isSupported(stored)) return stored;

    const browser = navigator.language?.slice(0, 2).toLowerCase();
    if (this.isSupported(browser)) return browser;

    return DEFAULT_LANG;
  }

  private isSupported(value: string | null | undefined): value is Lang {
    return value != null && (SUPPORTED_LANGS as readonly string[]).includes(value);
  }
}
