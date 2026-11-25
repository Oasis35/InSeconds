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
  /**
   * Le jeu du jour montre déjà à un invité un appel à créer un compte (toast de série, partie en pause) : les autres cartes de l'accueil ne le
   * répètent pas. Posé par le jeu du jour, lu par la carte amis.
   */
  accountCtaShown: boolean;
  /** Le point « Nouveau » de l'onglet Groupes (l'annonce des groupes, une fois sa carte fermée). Posé par le domaine des groupes, lu par la barre. */
  groupsNew: boolean;
  /** Le nombre d'alertes du panneau technique de l'admin, `null` tant qu'il n'est pas lu (et pour tout compte qui n'est pas admin). Posé par le domaine admin, lu par le bouton « Admin » de l'en-tête. */
  adminAlerts: number | null;
}

/**
 * Ce que les pages se disent à travers la coque (la barre du bas) sans s'importer : le Daily et les modes y posent leur état, la
 * barre le lit. Transverse (`core/`) : aucun domaine n'y est connu.
 */
export const ShellChromeStore = signalStore(
  { providedIn: 'root' },
  withState<ShellChromeState>({ survie: false, survieKnown: false, immersive: false, dailyDone: null, accountCtaShown: false, groupsNew: false, adminAlerts: null }),
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
    setAccountCtaShown(accountCtaShown: boolean): void {
      patchState(store, { accountCtaShown });
    },
    setGroupsNew(groupsNew: boolean): void {
      patchState(store, { groupsNew });
    },
    setAdminAlerts(adminAlerts: number | null): void {
      patchState(store, { adminAlerts });
    },
  })),
);
