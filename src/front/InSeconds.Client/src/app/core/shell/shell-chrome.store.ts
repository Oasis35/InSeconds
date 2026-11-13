import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

interface ShellChromeState {
  /** La V4 de l'interface (barre du bas, nouvel accueil...) est-elle active pour ce joueur ? Posé par le domaine qui porte le flag (l'accès Setlist). */
  v4: boolean;
  /** Le flag de la V4 est-il répondu ? Avant, `v4` vaut « non » sans que ce soit une réponse (l'accès se lit après l'identité). */
  v4Known: boolean;
  /** Une manche est en cours : la barre du bas disparaît pour ne pas distraire ni créer de sortie par erreur. Posé par les pages de jeu. */
  immersive: boolean;
  /** Le défi du jour est-il joué ? `null` tant qu'on ne le sait pas. Posé par le jeu du jour, lu par la barre (le défi qui s'agite) et les autres modes. */
  dailyDone: boolean | null;
}

/**
 * Ce que les pages se disent à travers la coque (la barre du bas de la V4) sans s'importer : le Daily et les modes y posent leur état, la
 * barre le lit. Transverse (`core/`) : aucun domaine n'y est connu.
 */
export const ShellChromeStore = signalStore(
  { providedIn: 'root' },
  withState<ShellChromeState>({ v4: false, v4Known: false, immersive: false, dailyDone: null }),
  withMethods(store => ({
    /** `known` : faux tant que l'accès n'est pas lu (les tests qui posent seulement `v4` le sont d'office). */
    setV4(v4: boolean, known = true): void {
      patchState(store, { v4, v4Known: known });
    },
    setImmersive(immersive: boolean): void {
      patchState(store, { immersive });
    },
    setDailyDone(dailyDone: boolean | null): void {
      patchState(store, { dailyDone });
    },
  })),
);
