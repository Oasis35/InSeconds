/** La vue générale du pool : le catalogue, commun à tous les modes. */
export const POOL_VIEW = 'pool';

/** Une vue par mode de jeu, en lecture seule : son identifiant est le nom du mode que le back donne à son usage. */
export interface ModeView {
  readonly id: string;
  readonly labelKey: string;
}

/**
 * Les modes que l'admin sait afficher. Un nouveau mode s'ajoute ici : il apparaît alors dans le sélecteur, dans le
 * filtre « Joué par » et en pastille dans la colonne Usage, sans autre changement du Pool.
 */
export const MODE_VIEWS: readonly ModeView[] = [
  { id: 'daily', labelKey: 'admin.pool.views.daily' },
];

export function modeView(id: string): ModeView | undefined {
  return MODE_VIEWS.find(view => view.id === id);
}
