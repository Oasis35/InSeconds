/** D'où vient l'effectif affiché dans le libellé d'un onglet (`AdminCounts`). */
export type TabCount = 'pool' | 'challenges' | 'players';

/** Un onglet de l'admin : son chemin sous `/admin`, son libellé nu et, s'il en a un, celui avec effectif. */
export interface AdminTab {
  readonly path: string;
  readonly label: string;
  /** Libellé avec l'effectif (`{ count }`), montré dès que l'onglet a chargé ses données : pas avant sa première ouverture. */
  readonly counted?: { readonly label: string; readonly source: TabCount };
}

/** Les onglets de l'admin, dans l'ordre de la v1. */
export const ADMIN_TABS: readonly AdminTab[] = [
  { path: 'dashboard', label: 'admin.tabs.dashboard' },
  { path: 'defis', label: 'admin.tabs.challengesPlain', counted: { label: 'admin.tabs.challenges', source: 'challenges' } },
  { path: 'catalogue', label: 'admin.tabs.poolPlain', counted: { label: 'admin.tabs.pool', source: 'pool' } },
  { path: 'joueurs', label: 'admin.tabs.playersPlain', counted: { label: 'admin.tabs.players', source: 'players' } },
  { path: 'actions', label: 'admin.tabs.actions' },
];

/** L'onglet d'arrivée sur `/admin`, comme en v1. */
export const DEFAULT_TAB = 'dashboard';

/** Les valeurs de l'ancien `?tab=` de la v1 qui ont gardé leur nom (le pool s'appelle désormais `catalogue`). */
export const LEGACY_TAB_NAMES: ReadonlySet<string> = new Set(['dashboard', 'defis', 'joueurs', 'actions']);
