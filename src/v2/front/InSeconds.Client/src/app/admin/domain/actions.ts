import { JobLastRun } from './job';

/** Bornes du délai de réutilisation d'un morceau, en jours (celles que l'API accepte, sinon 400). */
export const COOLDOWN_MIN_DAYS = 1;
export const COOLDOWN_MAX_DAYS = 3650;

/** Code d'erreur de la tâche de génération quand le pool n'a pas assez de morceaux avec extrait (elle réessaie toutes les 10 minutes). */
export const POOL_INSUFFICIENT_CODE = 'admin.pool_insufficient';

/** Un délai valide : un entier de 1 à 3650 jours. */
export function isValidCooldownDays(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= COOLDOWN_MIN_DAYS && value <= COOLDOWN_MAX_DAYS;
}

/** La couleur et l'icône d'un témoin : tout va bien, à surveiller, en échec, en cours, ou rien à dire. */
export type WitnessTone = 'ok' | 'warn' | 'error' | 'running' | 'none';

/**
 * Ce que le témoin d'une tâche affiche : un message (clé i18n sous `admin.actions.witness`, et ses nombres), l'instant
 * du dernier passage (ou du dernier essai en échec), et celui du prochain essai s'il y en a un. Les dates sont
 * formatées par l'écran.
 */
export interface Witness {
  readonly tone: WitnessTone;
  readonly key: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly at: string | null;
  readonly retryAt: string | null;
}

function witness(tone: WitnessTone, key: string, run: JobLastRun, counts: Record<string, number> = {}): Witness {
  return { tone, key, counts, at: run.at, retryAt: run.state === 'retry_scheduled' ? run.retryAt : null };
}

const NEVER: Witness = { tone: 'none', key: 'never', counts: {}, at: null, retryAt: null };

/** Un passage à montrer : ni jamais lancée, ni effacée (plus de 7 jours, ou supprimée dans le tableau de bord). */
function hasRun(run: JobLastRun | undefined): run is JobLastRun {
  return run !== undefined && run.state !== null && run.state !== 'deleted' && run.at !== null;
}

function hasFailed(run: JobLastRun): boolean {
  return run.state === 'failed' || run.state === 'retry_scheduled';
}

/** Ce qui est commun aux deux tâches : en cours, ou en échec ; `null` si elle a réussi. */
function runningOrFailed(run: JobLastRun): Witness | null {
  if (run.state === 'queued' || run.state === 'processing') return witness('running', 'running', run);
  if (hasFailed(run)) return witness('error', 'failed', run);
  return null;
}

/** Témoin de la génération du défi du jour : généré, déjà en place, pool insuffisant (avec le prochain essai), échec. */
export function challengeWitness(run: JobLastRun | undefined): Witness {
  if (!hasRun(run)) return NEVER;
  if (hasFailed(run) && run.errorCode === POOL_INSUFFICIENT_CODE) return witness('warn', 'poolInsufficient', run);
  return runningOrFailed(run)
    ?? (run.result?.['created'] === false ? witness('ok', 'challengeAlready', run) : witness('ok', 'challengeCreated', run));
}

/** Compte rendu du contrôle des extraits : combien vérifiés, corrigés, en échec chez Deezer. */
export interface RefreshReport {
  readonly checked: number;
  readonly updated: number;
  readonly failed: number;
}

/** Lit le compte rendu d'un contrôle réussi ; `null` si la tâche n'a pas réussi ou n'en a pas rendu. */
export function toRefreshReport(run: JobLastRun): RefreshReport | null {
  if (run.state !== 'succeeded' || run.result === null) return null;
  const { checked, updated, failed } = run.result;
  if (typeof checked !== 'number' || typeof updated !== 'number' || typeof failed !== 'number') return null;
  return { checked, updated, failed };
}

/** Témoin du contrôle des extraits : le compte rendu, à surveiller si Deezer n'a pas répondu pour au moins un morceau. */
export function previewsWitness(run: JobLastRun | undefined): Witness {
  if (!hasRun(run)) return NEVER;
  const failure = runningOrFailed(run);
  if (failure) return failure;
  const report = toRefreshReport(run);
  if (!report) return witness('ok', 'previewsChecked', run);
  return witness(report.failed > 0 ? 'warn' : 'ok', 'previewsReport', run, { ...report });
}
