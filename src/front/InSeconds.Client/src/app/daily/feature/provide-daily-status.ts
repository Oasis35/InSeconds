import { EnvironmentInjector, EnvironmentProviders, createEnvironmentInjector, inject, makeEnvironmentProviders } from '@angular/core';
import { DAILY_DONE_LOADER } from '../../core/shell/daily-done-loader';

/**
 * Ce que le jeu du jour branche dans l'app dès le démarrage : de quoi lire si le défi est joué hors de sa page (`GET /api/daily/today`, qui ne crée
 * aucun joueur). Le client n'est jamais dans le bundle initial : il se charge à la demande, dans un injecteur à part.
 */
export function provideDailyStatus(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: DAILY_DONE_LOADER,
      useFactory: () => {
        const parent = inject(EnvironmentInjector);
        return async (): Promise<boolean | null> => {
          const [{ DailyApi }, { provideDailyApi }] = await Promise.all([import('../data-access/daily.api'), import('../data-access/daily.providers')]);
          const injector = createEnvironmentInjector(provideDailyApi(), parent);
          try {
            const { state } = await injector.get(DailyApi).today();
            if (state === 'already_played' || state === 'abandoned') return true;
            return state === 'can_start' || state === 'resumable' ? false : null;
          } finally {
            injector.destroy();
          }
        };
      },
    },
  ]);
}
