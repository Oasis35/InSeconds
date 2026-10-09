import { JobStatus } from './job';

/** Bornes du délai de réutilisation d'un morceau, en jours (celles que l'API accepte, sinon 400). */
export const COOLDOWN_MIN_DAYS = 1;
export const COOLDOWN_MAX_DAYS = 3650;

/** Code d'erreur de la tâche de génération quand le pool n'a pas assez de morceaux avec extrait. */
export const POOL_INSUFFICIENT_CODE = 'admin.pool_insufficient';

/** Un délai valide : un entier de 1 à 3650 jours. */
export function isValidCooldownDays(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= COOLDOWN_MIN_DAYS && value <= COOLDOWN_MAX_DAYS;
}

/** Ce que la génération du défi du jour a donné, vu de l'écran. */
export type GenerateOutcome = 'created' | 'already' | 'pool_insufficient' | 'retry' | 'error';

/** Lit l'issue d'une exécution terminée de la génération (`{ created }` si réussie, code d'erreur sinon). */
export function toGenerateOutcome(job: JobStatus): GenerateOutcome {
  switch (job.state) {
    case 'succeeded':
      return job.result?.['created'] === false ? 'already' : 'created';
    case 'retry_scheduled':
      return 'retry';
    case 'failed':
      return job.errorCode === POOL_INSUFFICIENT_CODE ? 'pool_insufficient' : 'error';
    default:
      return 'error';
  }
}

/** Compte rendu du contrôle des extraits : combien vérifiés, corrigés, en échec chez Deezer. */
export interface RefreshReport {
  readonly checked: number;
  readonly updated: number;
  readonly failed: number;
}

/** Lit le compte rendu d'un contrôle terminé ; `null` si la tâche n'a pas réussi ou n'en a pas rendu. */
export function toRefreshReport(job: JobStatus): RefreshReport | null {
  if (job.state !== 'succeeded' || job.result === null) return null;
  const { checked, updated, failed } = job.result;
  if (typeof checked !== 'number' || typeof updated !== 'number' || typeof failed !== 'number') return null;
  return { checked, updated, failed };
}
