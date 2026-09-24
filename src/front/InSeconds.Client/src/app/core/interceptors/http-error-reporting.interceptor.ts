import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ErrorReportingService } from '../services/error-reporting.service';

/**
 * Remonte les appels API en échec réseau (status 0) ou en erreur serveur (5xx), avec le code
 * d'erreur (traceId) du ProblemDetails renvoyé par l'API quand il existe : les deux côtés se
 * retrouvent ainsi sur la même trace. Les 4xx sont des réponses métier attendues (déjà joué,
 * pseudo pris…) : ignorées. `/health` est sondé en boucle et peut légitimement échouer pendant
 * un redéploiement : ignoré aussi. L'erreur est toujours re-propagée telle quelle.
 */
export const httpErrorReportingInterceptor: HttpInterceptorFn = (req, next) => {
  const reporting = inject(ErrorReportingService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && shouldReport(req.url, error.status)) {
        void extractTraceId(error.error).then(traceId => {
          if (traceId) reporting.lastErrorCode.set(traceId);
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

/** Le client NSwag demande des réponses en Blob : le ProblemDetails doit être relu. */
export async function extractTraceId(body: unknown): Promise<string | null> {
  try {
    const parsed = body instanceof Blob ? JSON.parse(await body.text()) : body;
    const traceId = (parsed as { traceId?: unknown } | null)?.traceId;
    return typeof traceId === 'string' ? traceId : null;
  } catch {
    return null;
  }
}
