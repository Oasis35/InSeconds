import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { AppError, toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { CooldownSettings, cooldownTone } from '../domain/cooldown';
import {
  HARDEST_FIRST, NO_FILTERS, PoolFilters, PoolSort, PreviewFilter, SortColumn,
  StatusFilter, clampPage, filterTracks, nextSort, pageOf, sortTracks, statusOf, totalPages,
} from '../domain/pool-filters';
import { PoolTheme, PoolTrack, isUsed, trackLabel } from '../domain/pool-track';
import { POOL_VIEW } from '../domain/pool-views';
import { CooldownApi } from './cooldown.api';
import { AdminCounts } from './admin-counts';
import { CatalogueApi } from './catalogue.api';

/** Le message « enregistré » ou « erreur » du cooldown disparaît au bout de ce délai. */
export const COOLDOWN_RESULT_VISIBLE_MS = 3000;

export type CooldownSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Ce qu'une désactivation refusée a dit : le morceau est dans le défi du jour, ou autre chose a échoué. */
export type ToggleError = 'inToday' | 'error';

const TRACK_IN_TODAY_CHALLENGE = 'catalogue.track_in_today_challenge';
const NOT_FOUND = 'common.not_found';

/** Ce qu'une désactivation a rendu, vu de l'écran : rien, refus du défi du jour, ou autre échec. */
function toToggleError(error: AppError | null): ToggleError | null {
  if (error === null) return null;
  return error.code === TRACK_IN_TODAY_CHALLENGE ? 'inToday' : 'error';
}

interface PoolState {
  tracks: readonly PoolTrack[];
  /** La vue affichée : le pool général (`pool`) ou celle d'un mode, en lecture seule (son identifiant). */
  view: string;
  filters: PoolFilters;
  sort: PoolSort | null;
  /** Page demandée, à partir de 0 ; la page affichée est ramenée dans les bornes (`page`). */
  requestedPage: number;
  selectedIds: readonly number[];
  /** Morceaux dont la désactivation est en cours d'envoi (bouton désactivé le temps de la requête). */
  togglingIds: readonly number[];
  toggleError: ToggleError | null;
  /**
   * Le cooldown appliqué aujourd'hui (#275) : la part du pool réglée et les jours qu'elle donne. Il suit la taille du pool, il est donc
   * relu avec la liste ; `null` tant qu'il n'est pas lu, ou si sa lecture a échoué (l'onglet ne l'affiche pas).
   */
  cooldown: CooldownSettings | null;
  cooldownSave: CooldownSaveStatus;
  /** La liste des thèmes de l'admin ; vide tant qu'elle n'est pas lue. */
  themes: readonly PoolTheme[];
}

/**
 * Le pool de l'admin : liste des morceaux, filtres, tri, pagination, sélection, et les actions qui
 * le modifient (ajout, renommage, désactivation, suppression). Aucune mutation locale : après
 * chaque action réussie, la liste est relue (l'usage et les dates de déblocage viennent de l'API).
 * Les actions qui ouvrent une fenêtre rendent l'erreur à afficher dans celle-ci, ou `null`. Le réglage du cooldown (la part du pool
 * bloquée après un tirage) vit ici aussi : il est replié en tête de l'onglet Morceaux.
 */
export const PoolStore = signalStore(
  withRequestStatus(),
  withState<PoolState>({
    tracks: [], view: POOL_VIEW, filters: NO_FILTERS, sort: null, requestedPage: 0, selectedIds: [], togglingIds: [], toggleError: null,
    cooldown: null, cooldownSave: 'idle', themes: [],
  }),
  withComputed(({ tracks, view, filters, sort, requestedPage, selectedIds }) => {
    const filtered = computed(() => filterTracks(tracks(), filters(), view()));
    const sorted = computed(() => sortTracks(filtered(), sort(), view()));
    const pages = computed(() => totalPages(filtered().length));
    const page = computed(() => clampPage(requestedPage(), filtered().length));
    return {
      filtered,
      pages,
      page,
      pageTracks: computed(() => pageOf(sorted(), page())),
      /** Disponibles et utilisés, vus de la vue : tous modes confondus dans le pool, ce mode seul dans sa vue. */
      availableCount: computed(() => tracks().filter(t => statusOf(t, view()) === 'available').length),
      usedCount: computed(() => tracks().filter(t => statusOf(t, view()) === 'used').length),
      disabledCount: computed(() => tracks().filter(t => t.isDisabled).length),
      /** Les genres présents dans le pool, par ordre alphabétique : de quoi remplir le filtre « Genre ». */
      genres: computed(() => [...new Set(tracks().flatMap(t => t.genres))].sort((a, b) => a.localeCompare(b))),
      missingPreviewCount: computed(() => tracks().filter(t => t.preview === 'missing').length),
      /** Identifiant Deezer → vrai si le morceau est disponible, faux s'il a déjà servi : le badge « déjà en pool ». */
      existingDeezerIds: computed(() => new Map(tracks().map(t => [t.deezerTrackId, !isUsed(t)] as const))),
      /** Un morceau utilisé ne se supprime pas (409) : le bouton « Supprimer (N) » le sait d'avance. */
      selectionHasUsedTrack: computed(() => {
        const selected = new Set(selectedIds());
        return tracks().some(t => selected.has(t.id) && isUsed(t));
      }),
    };
  }),
  withComputed(({ pages, cooldown }) => ({
    /** Les jours de cooldown appliqués aujourd'hui ; `null` s'ils ne sont pas lus. */
    cooldownDays: computed(() => cooldown()?.days ?? null),
    cooldownTone: computed(() => {
      const current = cooldown();
      return current === null ? null : cooldownTone(current.days);
    }),
    hasMultiplePages: computed(() => pages() > 1),
  })),
  withMethods((store, api = inject(CatalogueApi), counts = inject(AdminCounts), settings = inject(CooldownApi)) => {
    const resetPage = () => patchState(store, { requestedPage: 0 });
    const setFilter = (change: Partial<PoolFilters>) => {
      patchState(store, { filters: { ...store.filters(), ...change }, requestedPage: 0 });
    };

    /** Numéro de la lecture la plus récente : une réponse plus ancienne, arrivée après elle, n'écrit rien. */
    let latestLoad = 0;
    let cooldownTimer: ReturnType<typeof setTimeout> | undefined;

    /** Le cooldown suit le pool (ajout, désactivation) : relu à chaque lecture de la liste ; un échec ne bloque pas le pool. */
    async function loadCooldown(mine: number): Promise<void> {
      try {
        const cooldown = await settings.getCooldown();
        if (mine === latestLoad) patchState(store, { cooldown });
      } catch {
        if (mine === latestLoad) patchState(store, { cooldown: null });
      }
    }

    /** Les thèmes sont relus avec la liste (leur nombre de morceaux change avec elle) ; un échec ne bloque pas le pool. */
    async function loadThemes(mine: number): Promise<void> {
      try {
        const themes = await api.listThemes();
        if (mine === latestLoad) patchState(store, { themes });
      } catch {
        // la liste reste telle quelle
      }
    }

    async function load(): Promise<void> {
      const mine = ++latestLoad;
      patchState(store, setPending());
      const settingRead = loadCooldown(mine);
      const themesRead = loadThemes(mine);
      try {
        const tracks = await api.listTracks();
        if (mine !== latestLoad) return;
        const known = new Set(tracks.map(t => t.id));
        counts.setPool(tracks.length);
        patchState(
          store,
          { tracks, selectedIds: store.selectedIds().filter(id => known.has(id)) },
          setFulfilled(),
        );
      } catch (error) {
        const appError = await toAppError(error);
        if (mine === latestLoad) patchState(store, setError(appError));
      }
      await settingRead;
      await themesRead;
    }

    /** Supprime un morceau ; déjà supprimé (une première tentative a abouti avant l'échec d'un autre) : rien à refaire. */
    async function deleteIgnoringMissing(id: number): Promise<void> {
      try {
        await api.deleteTrack(id);
      } catch (error_) {
        if ((await toAppError(error_)).code !== NOT_FOUND) throw error_;
      }
    }

    /** Lance une action de l'API ; relit le pool si elle réussit, rend l'erreur sinon. */
    async function mutate(action: () => Promise<void>): Promise<AppError | null> {
      try {
        await action();
      } catch (error) {
        return toAppError(error);
      }
      await load();
      return null;
    }

    /** Comme `mutate`, pour une action en plusieurs appels : une partie a pu aboutir avant l'échec, le pool est donc relu dans tous les cas. */
    async function mutateAndReload(action: () => Promise<void>): Promise<AppError | null> {
      let error: AppError | null = null;
      try {
        await action();
      } catch (error_) {
        error = await toAppError(error_);
      }
      await load();
      return error;
    }

    return {
      load,

      // --- filtres, tri, pagination ---
      setText: (text: string) => setFilter({ text }),
      setStatus: (status: StatusFilter) => setFilter({ status }),
      setPreview: (preview: PreviewFilter) => setFilter({ preview }),
      setPlayedBy: (playedBy: string) => setFilter({ playedBy }),
      setGenre: (genre: string) => setFilter({ genre }),
      setLastUsedFrom: (lastUsedFrom: string) => setFilter({ lastUsedFrom }),
      setLastUsedTo: (lastUsedTo: string) => setFilter({ lastUsedTo }),
      resetFilters: () => patchState(store, { filters: NO_FILTERS, requestedPage: 0 }),
      /** Change de vue : les filtres propres à une vue et le tri ne valent plus, le texte cherché reste. */
      setView(view: string): void {
        if (view === store.view()) return;
        patchState(store, {
          view, requestedPage: 0, sort: null, selectedIds: [],
          filters: { ...NO_FILTERS, text: store.filters().text },
        });
      },
      /** Depuis la vue d'un mode : retrouve le morceau dans le pool général, où l'on agit dessus. */
      openInPool(track: PoolTrack): void {
        patchState(store, {
          view: POOL_VIEW, requestedPage: 0, sort: null, selectedIds: [],
          filters: { ...NO_FILTERS, text: trackLabel(track).replace(' - ', ' ') },
        });
      },
      sortBy: (column: SortColumn) => patchState(store, { sort: nextSort(store.sort(), column) }),
      /** « Les moins trouvés » : trie par taux de réussite croissant, depuis la première page. */
      sortByHardest: () => patchState(store, { sort: HARDEST_FIRST, requestedPage: 0 }),
      previousPage: () => patchState(store, { requestedPage: Math.max(0, store.page() - 1) }),
      nextPage: () => patchState(store, { requestedPage: Math.min(store.pages() - 1, store.page() + 1) }),
      /** Va à une page (à partir de 0), par exemple celle reprise de l'adresse au rechargement. */
      goToPage: (page: number) => patchState(store, { requestedPage: Math.max(0, Math.floor(page)) }),

      // --- sélection ---
      toggleSelection(id: number): void {
        const selected = store.selectedIds();
        patchState(store, { selectedIds: selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id] });
      },
      clearSelection: () => patchState(store, { selectedIds: [] }),
      /** Les morceaux sélectionnés, dans l'ordre du pool. */
      selectedTracks: () => store.tracks().filter(t => store.selectedIds().includes(t.id)),

      // --- actions ---
      add: (deezerTrackId: number) => mutate(() => api.addTrack(deezerTrackId)),
      addTheme: (name: string) => mutate(() => api.addTheme(name.trim())),
      renameTheme: (id: number, name: string) => mutate(() => api.renameTheme(id, name.trim())),
      deleteTheme: (id: number) => mutate(() => api.deleteTheme(id)),
      setTrackThemes: (id: number, themeIds: readonly number[]) => mutate(() => api.setTrackThemes(id, themeIds)),
      /** Met ces morceaux du pool dans le thème (un par un, ceux qui l'ont déjà sont laissés), puis relit. */
      addTracksToTheme: (themeId: number, trackIds: readonly number[]) => mutateAndReload(async () => {
        for (const id of trackIds) {
          const track = store.tracks().find(t => t.id === id);
          if (track && !track.themeIds.includes(themeId)) await api.setTrackThemes(id, [...track.themeIds, themeId]);
        }
      }),
      /** Retire le morceau du thème : il reste dans le pool et garde ses autres thèmes. */
      removeTrackFromTheme: (themeId: number, trackId: number) => mutate(async () => {
        const track = store.tracks().find(t => t.id === trackId);
        if (track?.themeIds.includes(themeId)) await api.setTrackThemes(trackId, track.themeIds.filter(x => x !== themeId));
      }),
      /** Ajoute au pool le morceau de Deezer s'il n'y est pas encore, puis le met dans le thème. */
      addDeezerTrackToTheme: (themeId: number, deezerTrackId: number) => mutateAndReload(async () => {
        let track = store.tracks().find(t => t.deezerTrackId === deezerTrackId);
        if (!track) {
          await api.addTrack(deezerTrackId);
          track = (await api.listTracks()).find(t => t.deezerTrackId === deezerTrackId);
        }
        if (track && !track.themeIds.includes(themeId)) await api.setTrackThemes(track.id, [...track.themeIds, themeId]);
      }),
      rename: (id: number, artist: string, title: string, genre?: string) =>
        mutate(() => api.renameTrack(id, artist.trim(), title.trim(), genre?.trim())),

      /** Supprime ces morceaux (aucun n'a servi) ; s'arrête à la première erreur. */
      async remove(ids: readonly number[]): Promise<AppError | null> {
        // L'un après l'autre (une suppression attend la précédente) : arrêt à la première erreur.
        const error = await mutate(() => ids.reduce<Promise<void>>(
          (previous, id) => previous.then(() => deleteIgnoringMissing(id)),
          Promise.resolve(),
        ));
        if (error === null) {
          const removed = new Set(ids);
          patchState(store, { selectedIds: store.selectedIds().filter(id => !removed.has(id)) });
          resetPage();
        } else {
          // Une partie des morceaux a pu être supprimée avant l'échec : la liste est relue quand même.
          await load();
        }
        return error;
      },

      /**
       * Retire le morceau du tirage des prochains défis, ou l'y remet. Sans effet si une requête est
       * déjà en cours pour lui, ou pour désactiver un morceau du défi du jour (le bouton est grisé).
       */
      async toggleDisabled(track: PoolTrack): Promise<void> {
        const disable = !track.isDisabled;
        if (store.togglingIds().includes(track.id) || (disable && track.inTodayChallenge)) return;

        patchState(store, { togglingIds: [...store.togglingIds(), track.id], toggleError: null });
        const error = await mutate(() => api.setTrackDisabled(track.id, disable));
        patchState(store, {
          togglingIds: store.togglingIds().filter(id => id !== track.id),
          toggleError: toToggleError(error),
        });
      },
      dismissToggleError: () => patchState(store, { toggleError: null }),

      // --- cooldown ---
      /** Enregistre la part du pool en cooldown ; le cooldown affiché devient celui que l'API en a déduit. */
      async saveCooldown(poolPercent: number): Promise<void> {
        if (store.cooldownSave() === 'saving') return;
        clearTimeout(cooldownTimer);
        patchState(store, { cooldownSave: 'saving' });
        try {
          patchState(store, { cooldown: await settings.updateCooldownPercent(poolPercent), cooldownSave: 'saved' });
        } catch {
          patchState(store, { cooldownSave: 'error' });
        }
        cooldownTimer = setTimeout(() => patchState(store, { cooldownSave: 'idle' }), COOLDOWN_RESULT_VISIBLE_MS);
      },

      /** Arrête le minuteur du message du cooldown (destruction du store). */
      clearTimers(): void {
        clearTimeout(cooldownTimer);
      },
    };
  }),
  withHooks({ onDestroy: store => store.clearTimers() }),
);
