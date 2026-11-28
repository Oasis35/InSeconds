import { TestBed } from '@angular/core/testing';
import { StreakIconComponent, StreakIconName } from './streak-icon.component';

const NAMES: readonly StreakIconName[] = ['flame', 'snowflake', 'heart-crack', 'user'];

describe('StreakIconComponent', () => {
  function render(name: StreakIconName, size?: string) {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(StreakIconComponent);
    fixture.componentRef.setInput('name', name);
    if (size !== undefined) fixture.componentRef.setInput('size', size);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { element, svg: element.querySelector('svg')!, paths: () => Array.from(element.querySelectorAll('svg path')).map(p => p.getAttribute('d')) };
  }

  it.each(NAMES)('%s : une seule icône SVG, décorative (cachée aux lecteurs d\'écran)', name => {
    const { element, svg } = render(name);

    expect(element.querySelectorAll('svg')).toHaveLength(1);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('chaque icône a son dessin : aucun nom ne rend celui d\'un autre', () => {
    const drawings = NAMES.map(name => render(name).paths().join('|'));

    expect(new Set(drawings).size).toBe(NAMES.length);
    expect(drawings.every(drawing => drawing.length > 0)).toBe(true);
  });

  it('la flamme et le cœur brisé sont remplis à demi-transparence, le gel et le joueur seulement tracés', () => {
    expect(render('flame').svg.getAttribute('fill')).toBe('currentColor');
    expect(render('heart-crack').svg.getAttribute('fill')).toBe('currentColor');
    expect(render('snowflake').svg.getAttribute('fill')).toBe('none');
    expect(render('user').svg.getAttribute('fill')).toBe('none');
  });

  it('prend la couleur du texte (`currentColor`), jamais une couleur écrite', () => {
    for (const name of NAMES) expect(render(name).svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('la taille suit la police par défaut, et se règle', () => {
    const byDefault = render('flame').svg;
    expect(byDefault.getAttribute('width')).toBe('1.05em');
    expect(byDefault.getAttribute('height')).toBe('1.05em');

    const custom = render('flame', '20px').svg;
    expect(custom.getAttribute('width')).toBe('20px');
    expect(custom.getAttribute('height')).toBe('20px');
  });

  it('l\'hôte ne rétrécit pas dans une ligne flex', () => {
    const { element } = render('snowflake');

    expect(element.style.display).toBe('inline-flex');
    expect(element.style.flexShrink).toBe('0');
  });
});
