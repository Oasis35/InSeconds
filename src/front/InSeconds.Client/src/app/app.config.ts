import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { adminAuthInterceptor } from './core/interceptors/admin-auth.interceptor';
import { playerAuthInterceptor } from './core/interceptors/player-auth.interceptor';
import { ApiClient, API_BASE_URL } from './api/api.generated';
import { environment } from '../environments/environment';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { SettingsService } from './core/services/settings.service';
import { LanguageService } from './core/services/language.service';
import { CookieConsentService } from './core/services/cookie-consent.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([playerAuthInterceptor, adminAuthInterceptor])),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
    ApiClient,
    provideTranslateService({
      loader: provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json' }),
    }),
    provideAppInitializer(async () => {
      // inject() doit être appelé de façon synchrone, avant tout await — un await (même sur
      // une valeur non-Promise) fait sortir du contexte d'injection Angular (NG0203).
      const language = inject(LanguageService);
      const cookieConsent = inject(CookieConsentService);
      await language.init();
      // Après la langue : le bandeau cookies lit les traductions déjà chargées.
      await cookieConsent.init();
    }),
    provideAppInitializer(() => inject(SettingsService).load()),
  ],
};
