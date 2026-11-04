import { JobLastRun } from './job';

/**
 * L'état technique que l'admin affiche dans son panneau (barre de gauche sur PC, menu repliable sur téléphone) : le déploiement
 * (commit du front, de l'API, et dernier commit de la branche déployée lu chez GitHub), la santé (API, dernière sauvegarde), les
 * tâches de la nuit et l'intégration continue. Rien ici ne lit le réseau : les adaptateurs donnent les valeurs, ces fonctions les jugent.
 */

/** Ce que l'API dit d'elle-même (`GET /api/admin/system`). */
export interface SystemInfo {
  /** Commit de l'API déployée ; `null` hors d'une image de prod ou de staging. */
  readonly commit: string | null;
  /** Fin de la dernière sauvegarde réussie (texte ISO) ; `null` au staging ou sans sauvegarde. */
  readonly lastBackupAt: string | null;
  readonly lastBackupOffSite: boolean | null;
}

/** Le dernier passage de l'intégration continue sur une branche (lu chez GitHub). */
export interface CiRun {
  readonly branch: string;
  /** Le commit testé : le dernier poussé sur la branche, la CI tournant à chaque push. */
  readonly headSha: string;
  readonly state: CiState;
  /** La page du passage chez GitHub. */
  readonly url: string;
}

export type CiState = 'success' | 'failure' | 'running' | 'unknown';

/** Les deux branches déployées, dans l'ordre d'affichage : la prod (`main`) puis le staging. */
export const CI_BRANCHES = ['main', 'env/staging'] as const;
export type DeployedBranch = (typeof CI_BRANCHES)[number];

/** La branche que cet environnement déploie : `main` en prod, `env/staging` au staging, aucune en local et en E2E. */
export function deployedBranch(environmentName: string): DeployedBranch | null {
  if (environmentName === 'production') return 'main';
  if (environmentName === 'staging') return 'env/staging';
  return null;
}

/** L'état d'un passage d'après les champs `status` et `conclusion` de GitHub. Annulé ou sauté : on ne sait pas. */
export function toCiState(status: string | null | undefined, conclusion: string | null | undefined): CiState {
  if (status !== 'completed') return status ? 'running' : 'unknown';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return 'failure';
  return 'unknown';
}

/** Les sept premiers caractères d'un commit, comme GitHub les affiche. */
export function shortCommit(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

/** Deux empreintes désignent le même commit (l'une peut être abrégée). */
export function sameCommit(a: string, b: string): boolean {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x.startsWith(y) || y.startsWith(x);
}

/**
 * Le verdict du déploiement :
 * - `aligned` : front, API et dernier commit de la branche sont le même commit ;
 * - `same` : front et API identiques, la branche n'a pas pu être lue chez GitHub ;
 * - `deploying` : en retard sur la branche, dont la CI tourne encore (le déploiement suivra) : pas une alerte ;
 * - `pending` : front et API identiques mais en retard sur la branche, CI finie (déploiement en échec ou bloqué) ;
 * - `mismatch` : front et API ne viennent pas du même commit ;
 * - `unknown` : un des deux commits manque (build local, `ng serve`, E2E).
 */
export type DeploymentVerdict = 'aligned' | 'same' | 'deploying' | 'pending' | 'mismatch' | 'unknown';

export function deploymentVerdict(
  front: string | null, api: string | null, branchHead: string | null, branchCiRunning = false,
): DeploymentVerdict {
  if (!front || !api) return 'unknown';
  if (!sameCommit(front, api)) return 'mismatch';
  if (!branchHead) return 'same';
  if (sameCommit(front, branchHead)) return 'aligned';
  return branchCiRunning ? 'deploying' : 'pending';
}

/** Les quatre tâches de la nuit, dans l'ordre de la nuit (UTC) : contrôle des extraits, défi du jour, clôture, purge. */
export const NIGHTLY_JOBS = ['catalogue-refresh', 'daily-generate-challenge', 'daily-close-day', 'players-purge-expired-tokens'] as const;

/** Code d'erreur de la génération quand le pool n'a pas assez de morceaux avec extrait (elle réessaie toutes les 10 minutes). */
export const POOL_INSUFFICIENT_CODE = 'admin.pool_insufficient';

/** La couleur d'une tâche : réussie, à surveiller (pool insuffisant, extraits que Deezer n'a pas rendus), en échec, en cours, ou jamais lancée. */
export type JobTone = 'ok' | 'warn' | 'error' | 'running' | 'none';

export function jobTone(run: JobLastRun | undefined): JobTone {
  if (run?.state == null || run.state === 'deleted' || run.at === null) return 'none';
  if (run.state === 'queued' || run.state === 'processing') return 'running';
  if (run.state === 'failed' || run.state === 'retry_scheduled') return run.errorCode === POOL_INSUFFICIENT_CODE ? 'warn' : 'error';
  const failed = run.result?.['failed'];
  return typeof failed === 'number' && failed > 0 ? 'warn' : 'ok';
}

/** Une tâche de la nuit, telle que le panneau l'affiche : son nom (clé i18n `admin.system.jobs.<id>`), sa couleur, l'instant du passage. */
export interface NightlyJob {
  readonly id: string;
  readonly tone: JobTone;
  readonly at: string | null;
}

export function nightlyJobs(runs: readonly JobLastRun[]): NightlyJob[] {
  return NIGHTLY_JOBS.map(id => {
    const run = runs.find(r => r.id === id);
    return { id, tone: jobTone(run), at: run?.at ?? null };
  });
}

/** La sauvegarde de la nuit part à 3 h UTC : plus de 26 heures sans sauvegarde, une nuit a été manquée. */
export const BACKUP_MAX_AGE_HOURS = 26;

/** `none` : aucune sauvegarde connue (le staging n'en fait pas) ; `stale` : la dernière date d'avant la nuit dernière. */
export type BackupTone = 'ok' | 'stale' | 'none';

export function backupTone(lastBackupAt: string | null, now: Date): BackupTone {
  if (!lastBackupAt) return 'none';
  const ageHours = (now.getTime() - new Date(lastBackupAt).getTime()) / 3_600_000;
  return ageHours > BACKUP_MAX_AGE_HOURS ? 'stale' : 'ok';
}

/** Le pool vu du panneau technique : morceaux actifs sans extrait, et avec un extrait mais sans forme d'onde. */
export interface CatalogueHealth {
  readonly missingPreviewCount: number;
  readonly missingWaveformCount: number;
}

/** Ce que le tirage du défi de demain trouverait maintenant (`GET /api/admin/daily/next-challenge`). */
export interface NextChallenge {
  /** Demain, `aaaa-mm-jj`. */
  readonly date: string;
  /** Morceaux jouables hors cooldown pour demain. */
  readonly eligibleCount: number;
  /** Morceaux qu'un défi demande. */
  readonly requiredCount: number;
  readonly generated: boolean;
}

/**
 * La ligne « Défi de demain » : `ready` (assez de morceaux hors cooldown, ou déjà tiré), `insufficient` (pas assez : la génération de
 * minuit échouera), `retrying` (la génération du jour a échoué et réessaie : `retryAt` donne l'heure du prochain essai).
 */
export type NextChallengeState =
  | { readonly kind: 'ready'; readonly eligibleCount: number; readonly generated: boolean }
  | { readonly kind: 'insufficient'; readonly eligibleCount: number; readonly requiredCount: number }
  | { readonly kind: 'retrying'; readonly retryAt: string | null };

export const GENERATE_CHALLENGE_JOB = 'daily-generate-challenge';

export function nextChallengeState(next: NextChallenge, runs: readonly JobLastRun[] | null): NextChallengeState {
  const generation = runs?.find(run => run.id === GENERATE_CHALLENGE_JOB);
  if (generation?.state === 'failed' || generation?.state === 'retry_scheduled') return { kind: 'retrying', retryAt: generation.retryAt };
  if (!next.generated && next.eligibleCount < next.requiredCount) {
    return { kind: 'insufficient', eligibleCount: next.eligibleCount, requiredCount: next.requiredCount };
  }
  return { kind: 'ready', eligibleCount: next.eligibleCount, generated: next.generated };
}

/** Ce qui compte comme une alerte dans le bouton d'état du téléphone. */
export interface AlertInputs {
  readonly verdict: DeploymentVerdict;
  readonly apiDown: boolean;
  readonly backup: BackupTone;
  readonly jobs: readonly NightlyJob[];
  readonly ci: readonly (CiRun | null)[];
  /** Le défi de demain, s'il est lu ; un échec de la génération compte déjà par sa tâche. */
  readonly nextChallenge?: NextChallengeState | null;
}

/**
 * Le nombre d'alertes : déploiement désaligné ou en retard, API injoignable, sauvegarde manquée, tâche en échec ou à surveiller, CI rouge,
 * pas assez de morceaux pour le défi de demain.
 */
export function alertCount({ verdict, apiDown, backup, jobs, ci, nextChallenge }: AlertInputs): number {
  return (verdict === 'mismatch' || verdict === 'pending' ? 1 : 0)
    + (apiDown ? 1 : 0)
    + (backup === 'stale' ? 1 : 0)
    + jobs.filter(job => job.tone === 'error' || job.tone === 'warn').length
    + ci.filter(run => run?.state === 'failure').length
    + (nextChallenge?.kind === 'insufficient' ? 1 : 0);
}
