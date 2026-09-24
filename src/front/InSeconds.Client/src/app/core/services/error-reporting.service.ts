import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export type ClientErrorSource = 'js' | 'http';

export interface ClientErrorReport {
  source: ClientErrorSource;
  message: string;
  stack?: string | null;
  url?: string | null;
  httpStatus?: number | null;
  relatedTraceId?: string | null;
}

/**
 * Remonte les erreurs front vers l'API (`POST /api/client-errors`), qui les logue avec le
 * PlayerId du cookie : elles rejoignent la chronologie du joueur dans l'outil d'observabilité.
 *
 * - `HttpBackend` direct : la requête ne repasse pas par les intercepteurs (pas de boucle si
 *   l'envoi lui-même échoue) ; `withCredentials` posé à la main pour garder le cookie joueur.
 * - Plafonné et dédupliqué par chargement de page, bornes alignées sur le validator back.
 * - Jamais de query string (token de magic link, recherche tapée) : chemin seul.
 * - Un échec d'envoi est avalé : signaler une erreur ne doit jamais en créer une autre.
 */
@Injectable({ providedIn: 'root' })
export class ErrorReportingService {
  static readonly MAX_REPORTS_PER_PAGE = 10;

  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly alreadySent = new Set<string>();

  /** Code d'erreur (traceId) de la dernière réponse 5xx de l'API, affiché au joueur. */
  readonly lastErrorCode = signal<string | null>(null);

  report(report: ClientErrorReport): void {
    const key = `${report.source}|${report.message}`;
    if (this.alreadySent.has(key) || this.alreadySent.size >= ErrorReportingService.MAX_REPORTS_PER_PAGE) return;
    this.alreadySent.add(key);

    const body: ClientErrorReport = {
      source: report.source,
      message: truncate(report.message, 1000) || 'Erreur sans message',
      stack: truncate(report.stack, 8000),
      url: truncate(stripQuery(report.url ?? currentPath()), 500),
      httpStatus: report.httpStatus ?? null,
      relatedTraceId: truncate(report.relatedTraceId, 64),
    };

    this.http
      .post(`${environment.apiUrl}/api/client-errors`, body, { withCredentials: true })
      .subscribe({ error: () => undefined });
  }

  /** Exception JavaScript non gérée (ErrorHandler global). */
  reportError(error: unknown): void {
    const err = error instanceof Error ? error : null;
    this.report({
      source: 'js',
      message: err ? `${err.name}: ${err.message}` : String(error),
      stack: err?.stack ?? null,
    });
  }
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function stripQuery(url: string | null): string | null {
  if (!url) return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function currentPath(): string | null {
  return typeof window === 'undefined' ? null : window.location.pathname;
}
