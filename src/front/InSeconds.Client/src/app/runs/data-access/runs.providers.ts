import { Provider } from '@angular/core';
import { RUNS_API_BASE_URL, RunsClient } from '../../api/runs/api.generated';
import { environment } from '../../../environments/environment';
import { RunsApi } from './runs.api';

/**
 * L'adresse de l'API, le client généré et l'adaptateur du mode Run, fournis par la **route** `/runs` (jamais à la racine : un fournisseur du démarrage qui
 * importerait ce client mettrait tout le client dans le bundle initial). Vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`.
 */
export function provideRunsApi(): Provider[] {
  return [{ provide: RUNS_API_BASE_URL, useValue: environment.apiUrl }, RunsClient, RunsApi];
}
