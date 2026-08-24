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

  enable(): void {
    if (!environment.gaMeasurementId) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', environment.gaMeasurementId, { anonymize_ip: true });

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
