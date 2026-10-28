import {
  ApplicationConfig, ErrorHandler, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { provideAccount } from './account/feature/provide-account';
import { provideRuns } from './runs/feature/provide-runs';
import { routes } from './app.routes';
import { provideViewportReporting } from './core/diagnostics/viewport-reporter';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { credentialsInterceptor } from './core/http/credentials.interceptor';
import { httpErrorReportingInterceptor } from './core/http/http-error-reporting.interceptor';
import { LanguageService } from './core/i18n/language.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideViewportReporting(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(
      withFetch(),
      withInterceptors([credentialsInterceptor, httpErrorReportingInterceptor]),
    ),
    provideTranslateService({
      loader: provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json' }),
    }),
    provideAppInitializer(() => inject(LanguageService).init()),
    provideAccount(),
    provideRuns(),
    // Désactivé en dev (`ng serve`) : un service worker y servirait d'anciens fichiers.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
