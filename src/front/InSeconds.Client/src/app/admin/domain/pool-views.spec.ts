import fr from '../../../../public/i18n/fr.json';
import en from '../../../../public/i18n/en.json';
import { MODE_VIEWS, POOL_VIEW, modeView } from './pool-views';

type Tree = { [key: string]: string | Tree };

function has(tree: Tree, path: string): boolean {
  let node: string | Tree | undefined = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return false;
    node = node[part];
  }
  return typeof node === 'string' && node.length > 0;
}

describe('pool-views', () => {
  it('la vue générale n\'est celle d\'aucun mode', () => {
    expect(MODE_VIEWS.map(view => view.id)).not.toContain(POOL_VIEW);
  });

  it('chaque mode a un identifiant unique et un libellé traduit en français et en anglais', () => {
    const ids = MODE_VIEWS.map(view => view.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const view of MODE_VIEWS) {
      expect(has(fr as Tree, view.labelKey), `${view.labelKey} (fr)`).toBe(true);
      expect(has(en as Tree, view.labelKey), `${view.labelKey} (en)`).toBe(true);
    }
  });

  it('le Daily et la Survie sont les modes que l\'admin sait afficher', () => {
    expect(MODE_VIEWS.map(view => view.id)).toEqual(['daily', 'runs']);
  });

  it('modeView retrouve un mode par son identifiant, et rien pour un mode inconnu ou la vue générale', () => {
    expect(modeView('runs')).toBe(MODE_VIEWS[1]);
    expect(modeView('daily')?.labelKey).toBe('admin.pool.views.daily');
    expect(modeView('inconnu')).toBeUndefined();
    expect(modeView(POOL_VIEW)).toBeUndefined();
  });
});
