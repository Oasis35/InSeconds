/** D'où vient l'effectif affiché dans le libellé d'un onglet (`AdminCounts`). */
export type TabCount = 'challenges' | 'players';

/** Un onglet de l'admin : son chemin sous `/admin`, son libellé nu et, s'il en a un, celui avec effectif. */
export interface AdminTab {
  readonly path: string;
  readonly label: string;
  /** D'autres chemins de l'admin qui laissent l'onglet allumé (l'onglet Contenu groupe les Morceaux, les Thèmes et le sas « À valider »). */
  readonly alsoActive?: readonly string[];
  /** Libellé avec l'effectif (`{ count }`), montré dès que l'onglet a chargé ses données : pas avant sa première ouverture. */
  readonly counted?: { readonly label: string; readonly source: TabCount };
}

/** Les onglets de l'admin, dans leur ordre d'affichage. */
export const ADMIN_TABS: readonly AdminTab[] = [
  { path: 'dashboard', label: 'admin.tabs.dashboard' },
  { path: 'defis', label: 'admin.tabs.challengesPlain', counted: { label: 'admin.tabs.challenges', source: 'challenges' } },
  { path: 'catalogue', label: 'admin.tabs.content', alsoActive: ['themes', 'a-valider'] },
  { path: 'groupes', label: 'admin.tabs.groupsPlain' },
  { path: 'joueurs', label: 'admin.tabs.playersPlain', counted: { label: 'admin.tabs.players', source: 'players' } },
];

/** L'onglet d'arrivée sur `/admin`. */
export const DEFAULT_TAB = 'dashboard';

/** Les valeurs des anciennes adresses `?tab=` qui ont gardé leur nom (le pool s'appelle `catalogue`). */
export const LEGACY_TAB_NAMES: ReadonlySet<string> = new Set(['dashboard', 'defis', 'joueurs']);
