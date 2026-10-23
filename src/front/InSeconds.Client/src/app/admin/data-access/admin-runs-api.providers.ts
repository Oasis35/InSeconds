import { Provider } from '@angular/core';
import { RUNS_API_BASE_URL, RunsClient } from '../../api/runs/api.generated';
import { environment } from '../../../environments/environment';
import { AdminPlayersApi } from './players.api';

/**
 * Le client du mode Run pour l'admin (l'accès, `api/admin/runs`), fourni par les routes de l'admin, chargées à la demande, et non
 * au démarrage : un fournisseur du démarrage qui importe son jeton met tout le client (routes de la partie comprises) dans le bundle
 * initial. `AdminPlayersApi`, seul à s'en servir, est redonné ici pour recevoir ce client et non celui de la racine, sans adresse.
 */
export function provideAdminRunsApi(): Provider[] {
  return [{ provide: RUNS_API_BASE_URL, useValue: environment.apiUrl }, RunsClient, AdminPlayersApi];
}
