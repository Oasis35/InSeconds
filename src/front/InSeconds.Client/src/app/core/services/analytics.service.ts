import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Charge Google Analytics (gtag.js) uniquement après consentement — jamais au boot.
 * enable()/disable() sont appelés par CookieConsentService selon la catégorie "analytics".
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private scriptLoaded = false;

  private ensureDataLayer(): void {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  }

  /**
   * Google Consent Mode v2 : gtag.js reste en état "non configuré" tant qu'aucun
   * `consent default` n'a été déclaré — un `consent update` seul (sans `default`
   * préalable) ne suffit pas à débloquer l'envoi des hits (confirmé via Tag Assistant,
   * incident du 2026-08-24 : gtag chargeait, traitait `config`, mais n'envoyait jamais
   * de hit `collect`). Doit être appelé unconditionnellement au boot de l'app, avant
   * toute autre commande gtag et indépendamment du choix du bandeau cookies — ne charge
   * aucun script, juste une déclaration dans dataLayer.
   */
  declareDefaultConsent(): void {
    if (!environment.gaMeasurementId) return;

    this.ensureDataLayer();
    window.gtag!('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  enable(): void {
    if (!environment.gaMeasurementId) return;

    this.ensureDataLayer();
    window.gtag!('consent', 'update', { analytics_storage: 'granted' });
    window.gtag!('js', new Date());
    window.gtag!('config', environment.gaMeasurementId);

    if (!this.scriptLoaded) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${environment.gaMeasurementId}`;
      document.head.appendChild(script);
      this.scriptLoaded = true;
    }
  }

  disable(): void {
    window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  }
}
