/** État d'une exécution de tâche, tel que `GET /api/admin/jobs/{id}` le rend (§ 5.4 bis du plan v2). */
export type JobState = 'queued' | 'processing' | 'succeeded' | 'failed' | 'retry_scheduled' | 'deleted';

/**
 * Où en est une exécution lancée par un bouton de l'admin.
 * `result` : le compte rendu de la tâche si elle a réussi (`{ checked, updated, failed }`, `{ created, … }`) ;
 * `errorCode` : le code d'erreur si elle a échoué (`admin.pool_insufficient`), jamais un message.
 */
export interface JobStatus {
  readonly id: string;
  readonly state: JobState;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly errorCode: string | null;
}

/** Délai entre deux lectures de l'état d'une exécution (§ 5.4 bis : toutes les 2 secondes). */
export const JOB_POLL_INTERVAL_MS = 2000;

/**
 * L'écran n'a plus rien à attendre : réussie, échouée, supprimée, ou en attente d'un nouvel essai
 * (un réessai peut venir bien plus tard, l'écran le dit au lieu d'attendre).
 */
export function isSettled(state: JobState): boolean {
  return state !== 'queued' && state !== 'processing';
}

const STATES: readonly JobState[] = ['queued', 'processing', 'succeeded', 'failed', 'retry_scheduled', 'deleted'];

/** Un état inconnu de l'API (une version plus récente) est traité comme « en cours » : on relit. */
export function toJobState(value: string): JobState {
  return STATES.find(state => state === value) ?? 'processing';
}
