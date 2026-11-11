import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThemeIconComponent } from './theme-icon.component';
import { THEME_ICONS, filterThemeIcons, themeIconByName } from './theme-icon';

describe('ThemeIconComponent', () => {
  let fixture: ComponentFixture<ThemeIconComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ThemeIconComponent);
  });

  it('dessine le svg de l\'icône nommée', async () => {
    fixture.componentRef.setInput('name', 'music');
    fixture.componentRef.setInput('size', 24);
    await fixture.whenStable();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.querySelector('path')).not.toBeNull();
  });

  it.each([null, undefined, '', 'nom-inconnu'])('n\'affiche rien pour %s', async name => {
    fixture.componentRef.setInput('name', name);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('svg')).toBeNull();
  });
});

describe('stock d\'icônes', () => {
  it('a des noms uniques, au format que l\'API accepte', () => {
    const names = THEME_ICONS.map(icon => icon.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(name.length).toBeLessThanOrEqual(40);
    }
  });

  it('retrouve une icône par son nom', () => {
    expect(themeIconByName('guitar')?.name).toBe('guitar');
    expect(themeIconByName('nope')).toBeNull();
    expect(themeIconByName(null)).toBeNull();
  });

  it('filtre sans tenir compte des accents ni de la casse, et par catégorie', () => {
    expect(filterThemeIcons('GUITARE', null).map(i => i.name)).toContain('guitar');
    expect(filterThemeIcons('cœur', null).length).toBeGreaterThan(0);
    expect(filterThemeIcons('', 'animaux').every(i => i.category === 'animaux')).toBe(true);
    expect(filterThemeIcons('guitare', 'animaux')).toEqual([]);
    expect(filterThemeIcons('', null)).toEqual(THEME_ICONS);
  });
});
