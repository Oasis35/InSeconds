import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { AppError, toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import {
  Candidate, CandidateView, ParsedCandidateImport, PriorityFilter, candidatesOf, isAddable, sortCandidates,
} from '../domain/candidates';
import { AdminCounts } from './admin-counts';
import { CatalogueApi, ImportResult } from './catalogue.api';

/** Tant que des candidats attendent leur lecture chez Deezer ou leur ajout, la liste est relue à ce rythme. */
export const CANDIDATES_POLL_MS = 3000;
/** Sans progrès (rien de lu ni d'ajouté) pendant ce nombre de relectures de suite, le sondage s'arrête : Deezer ne répond pas, « Relancer la lecture » reprend. */
export const CANDIDATES_MAX_IDLE_POLLS = 20;

interface CandidatesState {
  candidates: readonly Candidate[];
  view: CandidateView;
  priority: PriorityFilter;
  selectedIds: readonly number[];
  /** Ce que le dernier import ou la dernière demande d'ajout a donné (message sous la liste) ; `null` : rien à dire. */
  lastImport: ImportResult | null;
  lastAdd: { queued: number; skipped: number } | null;
  /** Un import ou une action en cours d'envoi : les boutons attendent. */
  busy: boolean;
}

/**
 * Le sas « À valider » : les candidats importés, leur lecture chez Deezer (suivie par relectures tant qu'il en reste à lire ou à ajouter), la
 * sélection, et les actions (importer, ajouter la sélection au pool, écarter, remettre). Aucune mutation locale : après chaque action la liste
 * est relue.
 */
export const CandidatesStore = signalStore(
  withRequestStatus(),
  withState<CandidatesState>({
    candidates: [], view: 'todo', priority: null, selectedIds: [], lastImport: null, lastAdd: null, busy: false,
  }),
  withComputed(({ candidates, view, priority, selectedIds }) => {
    const shown = computed(() => sortCandidates(candidatesOf(candidates(), view(), priority())));
    return {
      shown,
      /** Ceux qui restent à traiter (ni écartés, ni ajoutés) : le chiffre de l'onglet. */
      todoCount: computed(() => candidates().filter(c => !c.isDismissed).length),
      dismissedCount: computed(() => candidates().filter(c => c.isDismissed).length),
      /** Pas encore lus chez Deezer : leur lecture est en cours. */
      pendingCount: computed(() => candidates().filter(c => c.status === 'pending' && !c.isDismissed).length),
      addingCount: computed(() => candidates().filter(c => c.isAdding).length),
      /** Ce que la sélection permet d'ajouter au pool. */
      addableSelectedIds: computed(() => {
        const selected = new Set(selectedIds());
        return candidates().filter(c => selected.has(c.id) && isAddable(c)).map(c => c.id);
      }),
      /** Les cases de la vue qu'on peut cocher pour ajouter (lues, avec extrait, pas au pool). */
      addableShownIds: computed(() => shown().filter(isAddable).map(c => c.id)),
    };
  }),
  withMethods((store, api = inject(CatalogueApi), counts = inject(AdminCounts)) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest = 0;
    let destroyed = false;
    let idlePolls = 0;
    let lastWaiting = -1;

    function schedulePoll(): void {
      clearTimeout(timer);
      const waiting = store.pendingCount() + store.addingCount();
      idlePolls = waiting === lastWaiting ? idlePolls + 1 : 0;
      lastWaiting = waiting;
      if (destroyed || waiting === 0 || idlePolls >= CANDIDATES_MAX_IDLE_POLLS) return;
      timer = setTimeout(() => void load(false), CANDIDATES_POLL_MS);
    }

    async function load(showPending = true): Promise<void> {
      const mine = ++latest;
      if (showPending) patchState(store, setPending());
      try {
        const candidates = await api.listCandidates();
        if (mine !== latest) return;
        const known = new Set(candidates.map(c => c.id));
        counts.setCandidates(candidates.filter(c => !c.isDismissed).length);
        patchState(store, { candidates, selectedIds: store.selectedIds().filter(id => known.has(id)) }, setFulfilled());
      } catch (error) {
        const appError = await toAppError(error);
        if (mine === latest) patchState(store, setError(appError));
      }
      if (mine === latest) schedulePoll();
    }

    /** Lance une action, relit la liste dans tous les cas (une partie a pu aboutir) et rend l'erreur, ou `null`. */
    async function act(action: () => Promise<void>): Promise<AppError | null> {
      idlePolls = 0;
      patchState(store, { busy: true });
      let error: AppError | null = null;
      try {
        await action();
      } catch (error_) {
        error = await toAppError(error_);
      }
      patchState(store, { busy: false });
      await load(false);
      return error;
    }

    return {
      load: () => {
        idlePolls = 0;
        return load();
      },

      setView(view: CandidateView): void {
        patchState(store, { view, selectedIds: [] });
      },
      setPriority(priority: PriorityFilter): void {
        patchState(store, { priority });
      },

      toggleSelection(id: number): void {
        const selected = store.selectedIds();
        patchState(store, { selectedIds: selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id] });
      },
      /** Coche tout ce qu'on peut ajouter dans la vue ; si tout l'est déjà, décoche. */
      toggleAllShown(): void {
        const ids = store.addableShownIds();
        const all = ids.length > 0 && ids.every(id => store.selectedIds().includes(id));
        patchState(store, { selectedIds: all ? [] : ids });
      },
      clearSelection: () => patchState(store, { selectedIds: [] }),

      /** Importe ce que l'admin a collé ; la lecture chez Deezer se poursuit en arrière-plan (la liste se rafraîchit seule). */
      importItems(parsed: ParsedCandidateImport): Promise<AppError | null> {
        patchState(store, { lastImport: null, lastAdd: null });
        return act(async () => {
          patchState(store, { lastImport: await api.importCandidates(parsed.items) });
        });
      },
      /** Ajoute au pool les candidats cochés (ceux qu'on peut ajouter) ; l'ajout se fait en arrière-plan, par lots espacés. */
      addSelected(): Promise<AppError | null> {
        const ids = store.addableSelectedIds();
        patchState(store, { lastImport: null, lastAdd: null });
        return act(async () => {
          patchState(store, { lastAdd: await api.addCandidates(ids), selectedIds: [] });
        });
      },
      dismissSelected(): Promise<AppError | null> {
        const ids = store.selectedIds();
        patchState(store, { lastImport: null, lastAdd: null });
        return act(async () => {
          await api.dismissCandidates(ids, true);
          patchState(store, { selectedIds: [] });
        });
      },
      /** Remet les candidats cochés (vue « Écartés ») dans la liste à traiter. */
      restoreSelected(): Promise<AppError | null> {
        const ids = store.selectedIds();
        return act(async () => {
          await api.dismissCandidates(ids, false);
          patchState(store, { selectedIds: [] });
        });
      },
      /** Relance la lecture des candidats que Deezer n'a pas encore rendus. */
      reread: () => act(async () => { await api.rereadCandidates(); }),

      /** Une adresse d'extrait neuve (elle expire au bout de 15 min). */
      previewUrl: (id: number) => api.candidatePreviewUrl(id),

      clearTimers(): void {
        destroyed = true;
        clearTimeout(timer);
      },
    };
  }),
  withHooks({ onDestroy: store => store.clearTimers() }),
);

