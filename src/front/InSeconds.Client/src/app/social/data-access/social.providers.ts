import { Provider } from '@angular/core';
import { SOCIAL_API_BASE_URL, SocialClient } from '../../api/social/api.generated';
import { environment } from '../../../environments/environment';
import { HomePlaceReader } from './home-place';
import { SocialApi } from './social.api';

/**
 * L'adresse de l'API, le client généré et l'adaptateur des groupes, fournis par les **routes** qui s'en servent (`/ranking`, `/setlist`), jamais
 * à la racine : le client resterait dans le bundle initial.
 */
export function provideSocialApi(): Provider[] {
  return [{ provide: SOCIAL_API_BASE_URL, useValue: environment.apiUrl }, SocialClient, SocialApi, HomePlaceReader];
}
