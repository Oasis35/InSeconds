import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

interface ShellChromeState {
  /** Le joueur a-t-il l'accès Survie ? Posé par le domaine qui le porte (`SetlistAccessStore`). Seul ce qui touche Survie en dépend : la coque (barre du bas, accueil) est pour tout le monde. */
  survie: boolean;
  /** L'accès Survie est-il répondu ? Avant, `survie` vaut « non » sans que ce soit une réponse (l'accès se lit après l'identité). */
  survieKnown: boolean;
  /** Une manche est en cours : la barre du bas disparaît pour ne pas distraire ni créer de sortie par erreur. Posé par les pages de jeu. */
  immersive: boolean;
  /** Le défi du jour est-il joué ? `null` tant qu'on ne le sait pas. Posé par le jeu du jour, lu par la barre (le défi qui s'agite) et les autres modes. */
  dailyDone: boolean | null;
}

/**
 * Ce que les pages se disent à travers la coque (la barre du bas) sans s'importer : le Daily et les modes y posent leur état, la
 * barre le lit. Transverse (`core/`) : aucun domaine n'y est connu.
 */
export const ShellChromeStore = signalStore(
  { providedIn: 'root' },
  withState<ShellChromeState>({ survie: false, survieKnown: false, immersive: false, dailyDone: null }),
  withMethods(store => ({
    /** `known` : faux tant que l'accès n'est pas lu (les tests qui posent seulement `survie` le sont d'office). */
    setSurvie(survie: boolean, known = true): void {
      patchState(store, { survie, survieKnown: known });
    },
    setImmersive(immersive: boolean): void {
      patchState(store, { immersive });
    },
    setDailyDone(dailyDone: boolean | null): void {
      patchState(store, { dailyDone });
    },
  })),
);
