import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Envoie le cookie de session sur les appels à l'API (`/api`, y compris l'admin : l'accès admin
 * est un rôle du compte, pas une authentification séparée). Jamais sur une autre origine
 * (Deezer, polices) : le cookie ne doit partir que vers l'API.
 */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url)) return next(req);
  return next(req.clone({ withCredentials: true }));
};

function isApiRequest(url: string): boolean {
  const apiRoot = `${environment.apiUrl}/api/`;
  return url.startsWith(apiRoot) || (environment.apiUrl === '' && url.startsWith('/api/'));
}
