/** État du dernier passage d'une tâche, tel que `GET /api/admin/jobs/last-runs` le rend (§ 5.4 bis du plan v2). */
export type JobState = 'queued' | 'processing' | 'succeeded' | 'failed' | 'retry_scheduled' | 'deleted';

/** La tâche de minuit qui génère le défi du jour. */
export const GENERATE_CHALLENGE_JOB = 'daily-generate-challenge';

/** La tâche de 23 h qui recontrôle les extraits Deezer. */
export const REFRESH_PREVIEWS_JOB = 'catalogue-refresh';

/**
 * Le dernier passage d'une tâche planifiée, affiché en témoin dans l'onglet Actions. Les instants sont des textes ISO.
 * `state` vide : jamais lancée, ou dernier passage de plus de 7 jours (Hangfire n'en garde pas plus).
 * `result` : le compte rendu si elle a réussi (`{ created, … }`, `{ checked, updated, failed }`) ;
 * `errorCode` : le code d'erreur si elle a échoué (`admin.pool_insufficient`), jamais un message.
 */
export interface JobLastRun {
  readonly id: string;
  readonly state: JobState | null;
  readonly at: string | null;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly errorCode: string | null;
  readonly retryAt: string | null;
  readonly nextRunAt: string | null;
}

const STATES: readonly JobState[] = ['queued', 'processing', 'succeeded', 'failed', 'retry_scheduled', 'deleted'];

/** Pas d'état : rien à montrer. Un état inconnu de l'API (une version plus récente) est traité comme « en cours ». */
export function toJobState(value: string | null | undefined): JobState | null {
  if (value === undefined || value === null) return null;
  return STATES.find(state => state === value) ?? 'processing';
}
