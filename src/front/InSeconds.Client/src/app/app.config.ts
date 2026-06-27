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
    provideAppInitializer(() => inject(LanguageService).init()),
    provideAppInitializer(() => inject(SettingsService).load()),
  ],
};
