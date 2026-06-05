import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { adminAuthInterceptor } from './core/interceptors/admin-auth.interceptor';
import { playerAuthInterceptor } from './core/interceptors/player-auth.interceptor';

import { routes } from './app.routes';
import { SettingsService } from './core/services/settings.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([playerAuthInterceptor, adminAuthInterceptor])),
    provideAppInitializer(() => inject(SettingsService).load()),
  ],
};
