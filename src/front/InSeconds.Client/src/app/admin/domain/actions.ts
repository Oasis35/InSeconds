import { JobLastRun } from './job';

/** Bornes de la part du pool en cooldown, en pourcentage (celles que l'API accepte, sinon 400). */
export const COOLDOWN_MIN_PERCENT = 10;
export const COOLDOWN_MAX_PERCENT = 90;

/**
 * Seuil d'alerte du cooldown, en jours : en dessous, un morceau revient trop vite, il faut ajouter des morceaux au pool.
 * Il ne bloque rien (#275), il colore le cooldown du pool et affiche un avertissement dans l'onglet Actions.
 */
export const COOLDOWN_ALERT_DAYS = 14;
/** En dessous, le cooldown est critique (rouge). */
export const COOLDOWN_CRITICAL_DAYS = 7;

/** Le cooldown en vigueur : la part du pool réglée, et ce qu'elle donne aujourd'hui sur le pool jouable. */
export interface CooldownSettings {
  readonly poolPercent: number;
  readonly days: number;
  readonly playableCount: number;
}

/** La couleur du cooldown : critique (moins de 7 jours), sous le seuil d'alerte (moins de 14), ou suffisant. */
export type CooldownTone = 'low' | 'medium' | 'high';

export function cooldownTone(days: number): CooldownTone {
  if (days < COOLDOWN_CRITICAL_DAYS) return 'low';
  if (days < COOLDOWN_ALERT_DAYS) return 'medium';
  return 'high';
}

/**
 * Code d'erreur de la tâche de génération quand le pool n'a pas assez de morceaux avec extrait (elle réessaie toutes les 10 minutes).
 * Son message générique est dans la table commune (`ERROR_MESSAGE_KEYS`) ; le témoin le reconnaît pour afficher le sien, daté.
 */
export const POOL_INSUFFICIENT_CODE = 'admin.pool_insufficient';

/** Une part valide : un entier de 10 à 90 %. */
export function isValidCooldownPercent(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= COOLDOWN_MIN_PERCENT && value <= COOLDOWN_MAX_PERCENT;
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
