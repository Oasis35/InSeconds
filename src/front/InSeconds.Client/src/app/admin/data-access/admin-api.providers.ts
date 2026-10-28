import { InjectionToken, Provider } from '@angular/core';
import { ADMIN_API_BASE_URL, AdminClient } from '../../api/admin/api.generated';
import { CATALOGUE_API_BASE_URL, CatalogueClient } from '../../api/catalogue/api.generated';
import { DAILY_API_BASE_URL, DailyClient } from '../../api/daily/api.generated';
import { RUNS_API_BASE_URL, RunsClient } from '../../api/runs/api.generated';
import { environment } from '../../../environments/environment';
import { ActionsApi } from './actions.api';
import { CatalogueApi } from './catalogue.api';
import { ChallengesApi } from './challenges.api';
import { DashboardApi } from './dashboard.api';
import { JobsApi } from './jobs.api';
import { AdminPlayersApi } from './players.api';
import { WeeklyStoryApi } from './weekly-story.api';

/** Adresse du tableau de bord des tâches planifiées (Hangfire), servi par l'API et réservé aux admins (`/jobs`, S3). */
export const JOBS_DASHBOARD_URL = new InjectionToken<string>('JOBS_DASHBOARD_URL');

/**
 * Les clients générés dont l'admin se sert (le suivi des tâches `api/admin`, le pool `api/catalogue`, les routes admin du jeu du jour `api/daily`
 * et l'accès au mode Run `api/runs`), leurs adresses et les adaptateurs de l'admin, fournis par les **routes** de l'admin, chargées à la demande,
 * et non au démarrage : un fournisseur du démarrage qui importe le jeton d'un client met tout ce client dans le bundle initial. Les clients sont
 * redonnés ici pour lire l'adresse de la route, absente de la racine. Vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`.
 */
export function provideAdminApi(): Provider[] {
  return [
    { provide: ADMIN_API_BASE_URL, useValue: environment.apiUrl },
    { provide: CATALOGUE_API_BASE_URL, useValue: environment.apiUrl },
    { provide: DAILY_API_BASE_URL, useValue: environment.apiUrl },
    { provide: RUNS_API_BASE_URL, useValue: environment.apiUrl },
    { provide: JOBS_DASHBOARD_URL, useValue: `${environment.apiUrl}/jobs` },
    AdminClient, CatalogueClient, DailyClient, RunsClient,
    ActionsApi, CatalogueApi, ChallengesApi, DashboardApi, JobsApi, AdminPlayersApi, WeeklyStoryApi,
  ];
}
