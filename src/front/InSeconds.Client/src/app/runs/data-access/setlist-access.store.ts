import { EnvironmentInjector, InjectionToken, createEnvironmentInjector, effect, inject, untracked } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { SessionStore } from '../../core/session/session.store';
import { ShellChromeStore } from '../../core/shell/shell-chrome.store';

/**
 * Lit l'accès au mode Setlist (`GET /api/runs/me`). Le client de l'API du mode n'est jamais dans le bundle initial : il se charge ici à la
 * demande, dans un injecteur à part (comme la route `/survie` et l'entrée de l'accueil). Un jeton pour que les tests le remplacent.
 */
export const SETLIST_ACCESS_LOADER = new InjectionToken<() => Promise<boolean>>('SETLIST_ACCESS_LOADER', {
  factory: () => {
    const parent = inject(EnvironmentInjector);
    return async () => {
      const [{ RunsApi }, { provideRunsApi }] = await Promise.all([import('./runs.api'), import('./runs.providers')]);
      const injector = createEnvironmentInjector(provideRunsApi(), parent);
      try {
        return (await injector.get(RunsApi).me()).hasAccess;
      } finally {
        injector.destroy();
      }
    };
  },
});

interface SetlistAccessState {
  /** `true` pour un compte que l'admin a autorisé : seul ce qui touche Survie en dépend (carte, niveau, Hits, défi d'ami, classement général). */
  hasAccess: boolean;
  /** `true` une fois la question posée et répondue (ou écartée pour un invité) : avant, `hasAccess` n'est pas encore une réponse. */
  loaded: boolean;
}

/**
 * L'accès à Survie : le joueur voit-il ce qui touche au mode ? Un seul interrupteur, l'accès posé par l'admin ; la coque (barre du bas, accueil)
 * n'en dépend pas. Un invité ne le demande pas (l'accès est lié à un compte), une erreur vaut « pas d'accès ».
 */
export const SetlistAccessStore = signalStore(
  { providedIn: 'root' },
  withState<SetlistAccessState>({ hasAccess: false, loaded: false }),
  withMethods(store => {
    const loader = inject(SETLIST_ACCESS_LOADER);
    let asked = false;
    return {
      /** Demande l'accès une seule fois pour ce compte ; sans compte, la réponse est « non » tout de suite. */
      async ensureLoaded(isLinked: boolean): Promise<void> {
        if (!isLinked) {
          asked = false;
          patchState(store, { hasAccess: false, loaded: true });
          return;
        }
        if (asked) return;
        asked = true;
        // Un compte qui vient de se connecter : le « non » d'avant n'est plus une réponse, les pages attendent la nouvelle.
        patchState(store, { loaded: false });
        try {
          patchState(store, { hasAccess: await loader(), loaded: true });
        } catch {
          patchState(store, { hasAccess: false, loaded: true });
        }
      },
    };
  }),
  withHooks({
    onInit(store) {
      const session = inject(SessionStore);
      const chrome = inject(ShellChromeStore);
      // L'accès est lu par la coque et par les pages des autres domaines, qui ne connaissent pas celui-ci.
      effect(() => chrome.setSurvie(store.hasAccess(), store.loaded()));
      effect(() => {
        // L'identité se lit au démarrage de l'app : tant qu'elle n'est pas connue, on ne conclut rien.
        if (!session.loaded()) return;
        const linked = session.isLinked();
        untracked(() => void store.ensureLoaded(linked));
      });
    },
  }),
);
