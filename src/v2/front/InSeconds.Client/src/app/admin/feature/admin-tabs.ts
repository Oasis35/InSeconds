/** Un onglet de l'admin : son chemin sous `/admin` et la clé de son libellé. */
export interface AdminTab {
  readonly path: string;
  readonly label: string;
}

/** Les onglets de l'admin, dans l'ordre de la v1. Seul le catalogue (Pool) est construit ; les autres arrivent en F2. */
export const ADMIN_TABS: readonly AdminTab[] = [
  { path: 'dashboard', label: 'admin.tabs.dashboard' },
  { path: 'defis', label: 'admin.tabs.challengesPlain' },
  { path: 'catalogue', label: 'admin.tabs.poolPlain' },
  { path: 'joueurs', label: 'admin.tabs.playersPlain' },
  { path: 'actions', label: 'admin.tabs.actions' },
];

/** Onglets qui n'ont pas encore leur module (F2) : ils mènent à une page d'attente. */
export const TABS_TO_COME: ReadonlySet<string> = new Set(
  ADMIN_TABS.map(tab => tab.path).filter(path => path !== 'catalogue'),
);
