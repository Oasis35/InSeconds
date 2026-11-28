import { MODE_VIEWS, POOL_VIEW, modeView } from './pool-views';
import { isTranslated } from './testing/translations';

describe('pool-views', () => {
  it('la vue générale n\'est celle d\'aucun mode', () => {
    expect(MODE_VIEWS.map(view => view.id)).not.toContain(POOL_VIEW);
  });

  it('chaque mode a un identifiant unique et un libellé traduit en français et en anglais', () => {
    const ids = MODE_VIEWS.map(view => view.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const view of MODE_VIEWS) {
      expect(isTranslated(view.labelKey), view.labelKey).toEqual({ fr: true, en: true });
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
