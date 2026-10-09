import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { JobLastRun } from '../domain/job';
import { ActionsApi } from './actions.api';
import { JOBS_DASHBOARD_URL } from './admin-api.providers';
import { JobsApi } from './jobs.api';

/** Les messages de résultat disparaissent au bout de ce délai (comme en v1). */
export const RESULT_VISIBLE_MS = 3000;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ActionsState {
  /** Le dernier passage de chaque tâche planifiée (témoins), lu à l'ouverture ; `null` tant qu'il n'est pas lu. */
  lastRuns: JobLastRun[] | null;
  /** La lecture des derniers passages a échoué : les témoins le disent, le reste de l'onglet fonctionne. */
  lastRunsFailed: boolean;
  /** Délai de réutilisation lu à l'ouverture (ou renvoyé par l'API après un enregistrement). */
  cooldownDays: number | null;
  cooldownSave: SaveStatus;
}

/**
 * L'onglet Actions : les témoins du dernier passage des tâches planifiées (génération du défi du jour, contrôle des
 * extraits ; les lancer à la main se fait dans le tableau de bord `/jobs`) et le délai de réutilisation des morceaux.
 * `requestStatus` est celui de la lecture du délai à l'ouverture.
 */
export const ActionsStore = signalStore(
  withRequestStatus(),
  withState<ActionsState>({ lastRuns: null, lastRunsFailed: false, cooldownDays: null, cooldownSave: 'idle' }),
  withProps(() => ({ jobsDashboardUrl: inject(JOBS_DASHBOARD_URL) })),
  withMethods((store, api = inject(ActionsApi), jobs = inject(JobsApi)) => {
    let cooldownTimer: ReturnType<typeof setTimeout> | undefined;

    const loadCooldown = async () => {
      patchState(store, setPending());
      try {
        patchState(store, { cooldownDays: await api.getCooldownDays() }, setFulfilled());
      } catch (e) {
        patchState(store, setError(await toAppError(e)));
      }
    };

    const loadLastRuns = async () => {
      try {
        patchState(store, { lastRuns: await jobs.getLastRuns(), lastRunsFailed: false });
      } catch {
        patchState(store, { lastRunsFailed: true });
      }
    };

    return {
      /** Lit le délai de réutilisation courant et le dernier passage des tâches, en parallèle. */
      async load(): Promise<void> {
        await Promise.all([loadCooldown(), loadLastRuns()]);
      },

      async saveCooldown(days: number): Promise<void> {
        if (store.cooldownSave() === 'saving') return;
        clearTimeout(cooldownTimer);
        patchState(store, { cooldownSave: 'saving' });
        try {
          patchState(store, { cooldownDays: await api.updateCooldownDays(days), cooldownSave: 'saved' });
        } catch {
          patchState(store, { cooldownSave: 'error' });
        }
        cooldownTimer = setTimeout(() => patchState(store, { cooldownSave: 'idle' }), RESULT_VISIBLE_MS);
      },

      /** Arrête le minuteur du message (destruction du store). */
      clearTimers(): void {
        clearTimeout(cooldownTimer);
      },
    };
  }),
  withHooks({ onDestroy: store => store.clearTimers() }),
);
