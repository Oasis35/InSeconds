import { InjectionToken, computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { environment } from '../../../environments/environment';
import { HealthService } from '../../core/health/health.service';
import { DEPLOYED_AT, FRONT_COMMIT } from '../../core/shell/deployed-at';
import { JobLastRun } from '../domain/job';
import {
  CI_BRANCHES, CiRun, DeployedBranch, SystemInfo, alertCount, backupTone, deployedBranch, deploymentVerdict, nightlyJobs,
} from '../domain/system';
import { GithubCiApi } from './github-ci.api';
import { JobsApi } from './jobs.api';
import { SystemApi } from './system.api';

/** Ce que le build du front sait de lui-même (piège 25) : remplacé dans les tests. */
export interface FrontBuild {
  readonly deployedAt: string | null;
  readonly commit: string | null;
  /** La branche que cet environnement déploie (`main`, `env/staging`), aucune en local et en E2E. */
  readonly branch: DeployedBranch | null;
}

export const FRONT_BUILD = new InjectionToken<FrontBuild>('FRONT_BUILD', {
  factory: () => ({ deployedAt: DEPLOYED_AT, commit: FRONT_COMMIT, branch: deployedBranch(environment.name) }),
});

interface SystemState {
  /** Ce que l'API dit d'elle-même ; `null` tant que ce n'est pas lu, ou si la lecture a échoué (`infoFailed`). */
  info: SystemInfo | null;
  infoFailed: boolean;
  /** Le dernier passage de chaque tâche planifiée ; `null` tant que ce n'est pas lu. */
  lastRuns: JobLastRun[] | null;
  lastRunsFailed: boolean;
  /** Le dernier passage de la CI de chaque branche déployée (`null` : pas lu chez GitHub) ; vide tant que rien n'est lu. */
  ci: Partial<Record<DeployedBranch, CiRun | null>>;
}

/**
 * Le panneau technique de l'admin, commun à tous les onglets (fourni par la coquille) : le déploiement (commit du front, de l'API, et
 * dernier commit de la branche chez GitHub), la santé de l'API (la sonde `/health` de `HealthService`) et la dernière sauvegarde, les
 * tâches de la nuit et l'intégration continue de la prod et du staging. Tout est lu en parallèle à l'ouverture de l'admin ; une lecture
 * en échec n'empêche pas les autres.
 */
export const SystemStore = signalStore(
  withState<SystemState>({ info: null, infoFailed: false, lastRuns: null, lastRunsFailed: false, ci: {} }),
  withProps(() => ({ build: inject(FRONT_BUILD), health: inject(HealthService) })),
  withComputed(({ info, lastRuns, ci, build, health }) => {
    const branchRun = computed(() => (build.branch ? ci()[build.branch] ?? null : null));
    const verdict = computed(() => deploymentVerdict(build.commit, info()?.commit ?? null, branchRun()?.headSha ?? null));
    const jobs = computed(() => (lastRuns() ? nightlyJobs(lastRuns() ?? []) : null));
    const backup = computed(() => backupTone(info()?.lastBackupAt ?? null, new Date()));
    const ciRuns = computed(() => CI_BRANCHES.map(branch => ({ branch, run: ci()[branch] ?? null })));
    return {
      /** Le dernier commit de la branche déployée par cet environnement (lu chez GitHub) ; `null` s'il n'est pas connu. */
      branchHead: computed(() => branchRun()?.headSha ?? null),
      verdict,
      jobs,
      backup,
      ciRuns,
      alerts: computed(() => alertCount({
        verdict: verdict(), apiDown: health.state() === 'ko', backup: backup(), jobs: jobs() ?? [], ci: ciRuns().map(c => c.run),
      })),
    };
  }),
  withMethods((store, system = inject(SystemApi), jobs = inject(JobsApi), github = inject(GithubCiApi)) => ({
    /** Lit l'état de l'API, les tâches et la CI des deux branches, en parallèle. */
    async load(): Promise<void> {
      const info = system.getInfo()
        .then(value => patchState(store, { info: value, infoFailed: false }))
        .catch(() => patchState(store, { infoFailed: true }));
      const runs = jobs.getLastRuns()
        .then(value => patchState(store, { lastRuns: value, lastRunsFailed: false }))
        .catch(() => patchState(store, { lastRunsFailed: true }));
      const ci = CI_BRANCHES.map(branch => github.latestRun(branch)
        .then(run => patchState(store, { ci: { ...store.ci(), [branch]: run } })));
      await Promise.all([info, runs, ...ci]);
    },
  })),
);
