import fr from '../../../../public/i18n/fr.json';
import en from '../../../../public/i18n/en.json';
import { ADMIN_ROUTES } from './admin.routes';
import { ADMIN_TABS, DEFAULT_TAB, LEGACY_TAB_NAMES } from './admin-tabs';

type Tree = { [key: string]: string | Tree };

function has(tree: Tree, path: string): boolean {
  let node: string | Tree | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return false;
    node = node[part];
  }
  return typeof node === 'string' && node.length > 0;
}

/** Les chemins des pages de l'admin : les enfants de la coquille qui chargent une page (les redirections ne comptent pas). */
const pagePaths = (ADMIN_ROUTES[0].children ?? []).filter(route => route.loadComponent !== undefined).map(route => route.path);

describe('onglets de l\'admin', () => {
  it('chaque onglet a un chemin unique', () => {
    const paths = ADMIN_TABS.map(tab => tab.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('chaque onglet, et chaque chemin qui l\'allume, est une page de l\'admin', () => {
    for (const tab of ADMIN_TABS) {
      expect(pagePaths, tab.path).toContain(tab.path);
      for (const other of tab.alsoActive ?? []) expect(pagePaths, `${tab.path} allumé par ${other}`).toContain(other);
    }
  });

  it('un chemin n\'allume qu\'un seul onglet et n\'est pas lui-même un onglet', () => {
    const tabPaths = new Set(ADMIN_TABS.map(tab => tab.path));
    const lit = ADMIN_TABS.flatMap(tab => tab.alsoActive ?? []);
    expect(new Set(lit).size).toBe(lit.length);
    for (const path of lit) expect(tabPaths.has(path), path).toBe(false);
  });

  it('l\'onglet d\'arrivée est un onglet, le premier de la barre', () => {
    expect(ADMIN_TABS.map(tab => tab.path)).toContain(DEFAULT_TAB);
    expect(ADMIN_TABS[0].path).toBe(DEFAULT_TAB);
  });

  it('les libellés, nus ou avec effectif, sont traduits en français et en anglais', () => {
    for (const tab of ADMIN_TABS) {
      for (const key of [tab.label, tab.counted?.label].filter((label): label is string => label !== undefined)) {
        expect(has(fr as Tree, key), `${key} (fr)`).toBe(true);
        expect(has(en as Tree, key), `${key} (en)`).toBe(true);
      }
    }
  });

  it('les anciennes adresses ?tab= qui ont gardé leur nom mènent à un onglet existant', () => {
    const tabPaths = ADMIN_TABS.map(tab => tab.path);
    for (const name of LEGACY_TAB_NAMES) expect(tabPaths, name).toContain(name);
  });
});
