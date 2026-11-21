import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';

/** État de l'historique d'un joueur sur un mode, un mois à la fois (Daily et Survie ont la même mécanique, pas la même forme de réponse). */
export interface MonthHistoryState<H> {
  status: 'loading' | 'ready' | 'error';
  history: H | null;
}

/**
 * Lit l'historique d'un mois (`aaaa-mm` ; `null` : le mois en cours). Une réponse dépassée par une demande plus récente est ignorée.
 * `readerOf` s'exécute dans le contexte d'injection du store : le mode y prend son adaptateur et rend sa lecture.
 */
export function withMonthHistory<H>(readerOf: () => (month: string | null) => Promise<H>) {
  return signalStoreFeature(
    withState<MonthHistoryState<H>>({ status: 'loading', history: null }),
    withMethods(store => {
      const read = readerOf();
      let request = 0;
      return {
        async load(month: string | null): Promise<void> {
          const id = ++request;
          patchState(store, { status: 'loading' });
          try {
            const history = await read(month);
            if (id === request) patchState(store, { status: 'ready', history });
          } catch {
            if (id === request) patchState(store, { status: 'error' });
          }
        },
      };
    }),
  );
}
