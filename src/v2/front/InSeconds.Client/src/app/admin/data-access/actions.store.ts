import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { GenerateOutcome, RefreshReport, toGenerateOutcome, toRefreshReport } from '../domain/actions';
import { JobState, JobStatus } from '../domain/job';
import { ActionsApi } from './actions.api';
import { JOBS_DASHBOARD_URL } from './admin-api.providers';
import { CatalogueApi } from './catalogue.api';
import { JobRunner } from './job-runner';

/** Les messages de résultat disparaissent au bout de ce délai (comme en v1). */
export const RESULT_VISIBLE_MS = 3000;

/** Où en est une tâche lancée par un bouton : rien, en file, ou en cours. */
export type RunPhase = 'idle' | 'queued' | 'running';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type RefreshResult = { readonly kind: 'report'; readonly report: RefreshReport } | { readonly kind: 'error' };

interface ActionsState {
  generatePhase: RunPhase;
  generateOutcome: GenerateOutcome | null;
  refreshPhase: RunPhase;
  refreshResult: RefreshResult | null;
  /** Délai de réutilisation lu à l'ouverture (ou renvoyé par l'API après un enregistrement). */
  cooldownDays: number | null;
  cooldownSave: SaveStatus;
}

function toPhase(state: JobState): RunPhase {
  return state === 'queued' ? 'queued' : 'running';
}

/**
 * L'onglet Actions : génération du défi du jour et contrôle des extraits (deux tâches Hangfire
 * suivies par `JobRunner`) et délai de réutilisation des morceaux. Un second clic pendant une
 * exécution ne relance rien. `requestStatus` est celui de la lecture du délai à l'ouverture.
 */
export const ActionsStore = signalStore(
  withRequestStatus(),
  withState<ActionsState>({
    generatePhase: 'idle', generateOutcome: null, refreshPhase: 'idle', refreshResult: null, cooldownDays: null, cooldownSave: 'idle',
  }),
  withProps(() => ({ jobsDashboardUrl: inject(JOBS_DASHBOARD_URL) })),
  withMethods((store, api = inject(ActionsApi), catalogue = inject(CatalogueApi), runner = inject(JobRunner)) => {
    const timers: { generate?: ReturnType<typeof setTimeout>; refresh?: ReturnType<typeof setTimeout>; cooldown?: ReturnType<typeof setTimeout> } = {};
    const later = (key: keyof typeof timers, action: () => void) => {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(action, RESULT_VISIBLE_MS);
    };

    return {
      /** Lit le délai de réutilisation courant. */
      async load(): Promise<void> {
        patchState(store, setPending());
        try {
          patchState(store, { cooldownDays: await api.getCooldownDays() }, setFulfilled());
        } catch (e) {
          patchState(store, setError(await toAppError(e)));
        }
      },

      async generateToday(): Promise<void> {
        if (store.generatePhase() !== 'idle') return;
        clearTimeout(timers.generate);
        patchState(store, { generatePhase: 'queued', generateOutcome: null });
        let outcome: GenerateOutcome;
        try {
          const id = await api.generateToday();
          const job = await runner.follow(id, (status: JobStatus) => patchState(store, { generatePhase: toPhase(status.state) }));
          outcome = toGenerateOutcome(job);
        } catch {
          outcome = 'error';
        }
        patchState(store, { generatePhase: 'idle', generateOutcome: outcome });
        // Un nouvel essai prévu reste affiché : c'est l'information utile tant que rien d'autre n'est lancé.
        if (outcome !== 'retry') later('generate', () => patchState(store, { generateOutcome: null }));
      },

      async refreshPreviews(): Promise<void> {
        if (store.refreshPhase() !== 'idle') return;
        clearTimeout(timers.refresh);
        patchState(store, { refreshPhase: 'queued', refreshResult: null });
        let result: RefreshResult;
        try {
          const id = await catalogue.refreshPreviews();
          const job = await runner.follow(id, (status: JobStatus) => patchState(store, { refreshPhase: toPhase(status.state) }));
          const report = toRefreshReport(job);
          result = report ? { kind: 'report', report } : { kind: 'error' };
        } catch {
          result = { kind: 'error' };
        }
        patchState(store, { refreshPhase: 'idle', refreshResult: result });
        later('refresh', () => patchState(store, { refreshResult: null }));
      },

      async saveCooldown(days: number): Promise<void> {
        if (store.cooldownSave() === 'saving') return;
        clearTimeout(timers.cooldown);
        patchState(store, { cooldownSave: 'saving' });
        try {
          patchState(store, { cooldownDays: await api.updateCooldownDays(days), cooldownSave: 'saved' });
        } catch {
          patchState(store, { cooldownSave: 'error' });
        }
        later('cooldown', () => patchState(store, { cooldownSave: 'idle' }));
      },

      /** Arrête les minuteurs des messages (destruction du store). */
      clearTimers(): void {
        clearTimeout(timers.generate);
        clearTimeout(timers.refresh);
        clearTimeout(timers.cooldown);
      },
    };
  }),
  withHooks({ onDestroy: store => store.clearTimers() }),
);
