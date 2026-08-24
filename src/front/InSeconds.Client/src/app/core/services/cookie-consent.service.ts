import { Injectable, effect, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import * as CookieConsent from 'vanilla-cookieconsent';
import { LanguageService, SUPPORTED_LANGS } from './language.service';
import { AnalyticsService } from './analytics.service';

interface CookieConsentTranslations {
  cookieConsent: CookieConsent.Translation;
}

/**
 * Bandeau de gestion des cookies (vanilla-cookieconsent) — thème/couleurs pilotés par
 * les variables CSS globales (styles.scss), traductions tirées des fichiers i18n
 * existants (clé "cookieConsent") pour rester dans la langue courante du front.
 * Google Analytics n'est chargé (AnalyticsService.enable()) que si la catégorie
 * "analytics" est acceptée — jamais avant.
 */
@Injectable({ providedIn: 'root' })
export class CookieConsentService {
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly analytics = inject(AnalyticsService);

  private ready = false;

  constructor() {
    // Répercute le changement de langue du site sur le bandeau, une fois initialisé.
    effect(() => {
      const lang = this.language.current();
      if (this.ready) {
        void CookieConsent.setLanguage(lang, true);
      }
    });
  }

  init(): Promise<void> {
    // Désactivé en E2E (flag posé par e2e/fixtures/test.ts) : le bandeau bloquant
    // interceptrait les clics dans tous les specs, comme pour __disableHealthPolling.
    if (typeof window !== 'undefined' && (window as { __disableCookieConsent?: boolean }).__disableCookieConsent === true) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      forkJoin(
        SUPPORTED_LANGS.map((lang) => this.translate.reloadLang(lang)),
      ).subscribe((files) => {
        const translations = Object.fromEntries(
          SUPPORTED_LANGS.map((lang, i) => [
            lang,
            (files[i] as unknown as CookieConsentTranslations).cookieConsent,
          ]),
        );

        CookieConsent.run({
          guiOptions: {
            consentModal: { layout: 'box', position: 'bottom right', equalWeightButtons: true },
            preferencesModal: { layout: 'box', equalWeightButtons: true },
          },
          categories: {
            necessary: { readOnly: true },
            analytics: {},
          },
          language: {
            default: 'fr',
            autoDetect: 'document',
            translations,
          },
          onFirstConsent: () => this.syncAnalytics(),
          onConsent: () => this.syncAnalytics(),
          onChange: () => this.syncAnalytics(),
        }).then(() => {
          this.ready = true;
          resolve();
        });
      });
    });
  }

  showPreferences(): void {
    CookieConsent.showPreferences();
  }

  private syncAnalytics(): void {
    if (CookieConsent.acceptedCategory('analytics')) {
      this.analytics.enable();
    } else {
      this.analytics.disable();
    }
  }
}
