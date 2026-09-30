import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { readProblemDetails } from '../errors/app-error';
import { ErrorReportingService } from '../errors/error-reporting.service';

/**
 * Remonte les appels API en échec réseau (status 0) ou en erreur serveur (5xx), avec le code
 * d'erreur (traceId) du ProblemDetails quand il existe : front et back se retrouvent sur la même
 * trace. Les 4xx sont des réponses métier attendues : ignorées. `/health` est sondé en boucle et
 * peut légitimement échouer pendant un redéploiement : ignoré aussi. L'erreur est re-propagée.
 */
export const httpErrorReportingInterceptor: HttpInterceptorFn = (req, next) => {
  const reporting = inject(ErrorReportingService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && shouldReport(req.url, error.status)) {
        void readProblemDetails(error.error).then(problem => {
          const traceId = typeof problem?.traceId === 'string' ? problem.traceId : null;
          if (traceId) reporting.setLastErrorCode(traceId);
          reporting.report({
            source: 'http',
            message: `${req.method} ${pathOf(req.url)} → ${error.status || 'échec réseau'}`,
            url: req.url,
            httpStatus: error.status,
            relatedTraceId: traceId,
          });
        });
      }
      return throwError(() => error);
    }),
  );
};

function shouldReport(url: string, status: number): boolean {
  if (!url.includes('/api') || url.includes('/health')) return false;
  return status === 0 || status >= 500;
}

function pathOf(url: string): string {
  try {
    // Base factice pour résoudre une URL relative ; seul le chemin est gardé.
    return new URL(url, 'https://inseconds.invalid').pathname;
  } catch {
    return url;
  }
}
