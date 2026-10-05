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

/**
 * Forme de l'`ApiException` que lèvent les clients NSwag (le dossier `api/` est généré, `core` ne
 * l'importe pas) : le statut HTTP et le corps de la réponse en texte.
 */
interface NswagApiException {
  readonly isApiException: true;
  readonly status: number;
  readonly response: string;
}

function isNswagApiException(error: unknown): error is NswagApiException {
  return typeof error === 'object' && error !== null && (error as { isApiException?: unknown }).isApiException === true;
}

/**
 * Pour une réponse d'erreur dont le corps est décrit dans OpenAPI (`ProblemDetails`), le client
 * NSwag lève ce corps déjà lu plutôt qu'une `ApiException` : un objet avec `status`, `code` et `traceId`.
 */
interface ProblemLike {
  readonly status: number;
  readonly code: string;
  readonly traceId?: unknown;
}

function isProblemLike(error: unknown): error is ProblemLike {
  if (typeof error !== 'object' || error === null) return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  return typeof status === 'number' && typeof code === 'string';
}

/**
 * Convertit n'importe quelle erreur levée par un appel HTTP en `AppError` : une `HttpErrorResponse`
 * (appel `HttpClient` direct) ou ce que lève un client NSwag (`ApiException`, ou le `ProblemDetails` lu quand OpenAPI le décrit).
 */
export async function toAppError(error: unknown): Promise<AppError> {
  if (isNswagApiException(error)) {
    return fromResponse(error.status, error.response);
  }
  if (isProblemLike(error)) {
    return fromResponse(error.status, error);
  }
  if (!(error instanceof HttpErrorResponse)) {
    return { code: UNEXPECTED_ERROR_CODE, status: 0, traceId: null };
  }
  return fromResponse(error.status, error.error);
}

async function fromResponse(status: number, body: unknown): Promise<AppError> {
  if (status === 0) {
    return { code: NETWORK_ERROR_CODE, status: 0, traceId: null };
  }
  const problem = await readProblemDetails(typeof body === 'string' ? parseJson(body) : body);
  return {
    code: typeof problem?.code === 'string' ? problem.code : UNEXPECTED_ERROR_CODE,
    status,
    traceId: typeof problem?.traceId === 'string' ? problem.traceId : null,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
