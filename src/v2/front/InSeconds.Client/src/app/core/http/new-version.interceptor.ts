import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NEW_VERSION_ERROR_CODE, readProblemDetails } from '../errors/app-error';
import { VersionService } from '../version/version.service';

/**
 * Après la bascule, les anciennes routes répondent `410` avec le code `common.new_version`
 * (§ 6.6 du plan v2) : un onglet resté ouvert sur une vieille version se voit proposer de
 * recharger, exactement comme quand le service worker détecte une nouvelle version.
 */
export const newVersionInterceptor: HttpInterceptorFn = (req, next) => {
  const version = inject(VersionService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 410) {
        void readProblemDetails(error.error).then(problem => {
          if (problem?.code === NEW_VERSION_ERROR_CODE) version.markUpdateAvailable();
        });
      }
      return throwError(() => error);
    }),
  );
};
