import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { ArchiveDay, ArchiveMe, NOBODY, isDateText, mostMissedPosition } from '../domain/archive';
import { DailyToday } from '../domain/daily';
import { DailyApi } from './daily.api';

export type ArchiveStatus = 'loading' | 'ready' | 'not_found' | 'error';

interface ArchiveState {
  status: ArchiveStatus;
  /** Le jour demandé (`aaaa-mm-jj`), même mal écrit. */
  date: string;
  day: ArchiveDay | null;
  /** Ce que le joueur reconnu y a fait ; personne tant que ce n'est pas lu (ou si la lecture échoue). */
  me: ArchiveMe;
  /** Les jours publiés, pour le calendrier ; lus une fois, à la première ouverture. */
  dates: readonly string[] | null;
  /** L'état du jour, pour la gélule de série de l'en-tête ; vide tant que ce n'est pas lu. */
  today: DailyToday | null;
}

const initialState: ArchiveState = { status: 'loading', date: '', day: null, me: NOBODY, dates: null, today: null };

/**
 * La page d'un jour passé (#407) : les réponses de tous (route publique, mise en cache), puis ce qu'en a fait le joueur reconnu (route à part,
 * jamais en cache). Un échec de la seconde n'empêche rien : la page s'affiche comme pour un visiteur. À fournir à la page.
 */
export const ArchiveStore = signalStore(
  withState<ArchiveState>(initialState),
  withComputed(store => ({
    mostMissed: computed(() => {
      const day = store.day();
      return day ? mostMissedPosition(day) : null;
    }),
    played: computed(() => store.me().played),
  })),
  withMethods((store, api = inject(DailyApi)) => {
    let request = 0;
    return {
      async load(date: string): Promise<void> {
        const id = ++request;
        patchState(store, { status: 'loading', date, day: null, me: NOBODY });
        if (!isDateText(date)) {
          patchState(store, { status: 'not_found' });
          return;
        }
        try {
          const [day, me] = await Promise.all([api.archiveDay(date), api.myArchiveDay(date).catch(() => NOBODY)]);
          if (id !== request) return;
          patchState(store, day ? { status: 'ready', day, me } : { status: 'not_found' });
        } catch {
          if (id === request) patchState(store, { status: 'error' });
        }
      },

      /** Les jours publiés (le calendrier) ; vide si la lecture échoue. */
      async loadDates(): Promise<readonly string[]> {
        if (store.dates() === null) {
          try {
            patchState(store, { dates: await api.archiveDates() });
          } catch {
            return [];
          }
        }
        return store.dates() ?? [];
      },

      /** La série du joueur, pour la gélule de l'en-tête (rien n'est créé). */
      async loadToday(): Promise<void> {
        try {
          patchState(store, { today: await api.today() });
        } catch {
          // la page s'affiche sans gélule
        }
      },
    };
  }),
);
