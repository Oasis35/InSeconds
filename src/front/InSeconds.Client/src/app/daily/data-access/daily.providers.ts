import { Provider } from '@angular/core';
import { DAILY_API_BASE_URL, DailyClient } from '../../api/daily/api.generated';
import { environment } from '../../../environments/environment';
import { DailyApi } from './daily.api';

/**
 * L'adresse de l'API, le client généré et l'adaptateur du jeu du jour, fournis par la **route** `/daily` (jamais à la racine : un fournisseur du
 * démarrage qui importerait ce client mettrait tout le client dans le bundle initial). Le client est redonné ici pour lire l'adresse de la route,
 * absente de la racine. Vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`.
 */
export function provideDailyApi(): Provider[] {
  return [{ provide: DAILY_API_BASE_URL, useValue: environment.apiUrl }, DailyClient, DailyApi];
}
