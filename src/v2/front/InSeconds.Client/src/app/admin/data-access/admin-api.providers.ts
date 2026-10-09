import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { ADMIN_API_BASE_URL } from '../../api/admin/api.generated';
import { DAILY_API_BASE_URL } from '../../api/daily/api.generated';
import { environment } from '../../../environments/environment';

/** Adresse du tableau de bord des tâches planifiées (Hangfire), servi par l'API et réservé aux admins (`/jobs`, S3). */
export const JOBS_DASHBOARD_URL = new InjectionToken<string>('JOBS_DASHBOARD_URL');

/**
 * Adresse de l'API pour les clients générés de l'admin : le suivi des tâches (`api/admin`) et les routes
 * admin du jeu du jour (`api/daily`, déjà fournie par le domaine `daily` : la même valeur, redonnée ici pour
 * que l'admin ne dépende pas de l'ordre des fournisseurs). Vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`.
 */
export function provideAdminApi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ADMIN_API_BASE_URL, useValue: environment.apiUrl },
    { provide: DAILY_API_BASE_URL, useValue: environment.apiUrl },
    { provide: JOBS_DASHBOARD_URL, useValue: `${environment.apiUrl}/jobs` },
  ]);
}
