import { HttpErrorResponse } from '@angular/common/http';

/**
 * Erreur telle que l'app la manipule : le code stable renvoyé par l'API dans le `ProblemDetails`
 * (`daily.already_played`), le statut HTTP et le `traceId`, affiché au joueur comme code d'erreur
 * et recherchable tel quel dans l'outil d'observabilité.
 */
export interface AppError {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | null;
}

/** Pas de réponse du serveur (coupure réseau, CORS, API arrêtée). */
export const NETWORK_ERROR_CODE = 'common.network';
/** Réponse d'erreur sans `code` lisible (proxy, page HTML, bug). */
export const UNEXPECTED_ERROR_CODE = 'common.unexpected';
/** Renvoyé par les anciennes routes après la bascule : une nouvelle version du front existe. */
export const NEW_VERSION_ERROR_CODE = 'common.new_version';

interface ProblemDetailsFields {
  code?: unknown;
  traceId?: unknown;
}

/**
 * Relit le corps d'une réponse d'erreur. Un client NSwag le reçoit en `Blob`, `HttpClient` en
 * objet : les deux sont acceptés. Tout corps illisible donne `null`.
 */
export async function readProblemDetails(body: unknown): Promise<ProblemDetailsFields | null> {
  try {
    const parsed: unknown = body instanceof Blob ? JSON.parse(await body.text()) : body;
    return parsed !== null && typeof parsed === 'object' ? (parsed as ProblemDetailsFields) : null;
  } catch {
    return null;
  }
}

/** Convertit n'importe quelle erreur levée par un appel HTTP en `AppError`. */
export async function toAppError(error: unknown): Promise<AppError> {
  if (!(error instanceof HttpErrorResponse)) {
    return { code: UNEXPECTED_ERROR_CODE, status: 0, traceId: null };
  }
  if (error.status === 0) {
    return { code: NETWORK_ERROR_CODE, status: 0, traceId: null };
  }
  const problem = await readProblemDetails(error.error);
  return {
    code: typeof problem?.code === 'string' ? problem.code : UNEXPECTED_ERROR_CODE,
    status: error.status,
    traceId: typeof problem?.traceId === 'string' ? problem.traceId : null,
  };
}
